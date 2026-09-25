const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { ethers } = require('ethers');
const app = express();
const PORT = 3000;
const GANACHE_RPC = 'http://127.0.0.1:8545';
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
// 1. Connect SQLite
const db = new sqlite3.Database('./database.sqlite', (err) => {
  if (err) console.error('SQLite Error:', err.message);
  else {
    console.log('Connected to local SQLite database.');
    initTables();
  }
});
function initTables() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS patients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        health_uid TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS doctors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doctor_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        wallet_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS medical_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_uid TEXT NOT NULL,
        doctor_id TEXT NOT NULL,
        diagnosis TEXT NOT NULL,
        symptoms TEXT,
        prescription TEXT,
        notes TEXT,
        record_hash TEXT,
        tx_hash TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS access_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_uid TEXT NOT NULL,
        doctor_id TEXT NOT NULL,
        status TEXT CHECK(status IN ('pending', 'approved', 'denied', 'revoked')) DEFAULT 'pending',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(patient_uid, doctor_id)
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_type TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        action TEXT NOT NULL,
        target_patient_uid TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.run(`ALTER TABLE doctors ADD COLUMN wallet_address TEXT`, () => {});
    db.run(`ALTER TABLE medical_records ADD COLUMN record_hash TEXT`, () => {});
    db.run(`ALTER TABLE medical_records ADD COLUMN tx_hash TEXT`, () => {});
  });
}
function logAudit(actor_type, actor_id, action, target_patient_uid) {
  const stmt = db.prepare(`
    INSERT INTO audit_log (actor_type, actor_id, action, target_patient_uid)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(actor_type, actor_id, action, target_patient_uid, (err) => {
    if (err) console.error('[Audit Error]:', err.message);
  });
  stmt.finalize();
}
// 2. Blockchain Setup (MedicalLedger + MedCredit ERC-20)
let provider = null;
let ledgerContract = null;
let tokenContract = null;
let ganacheAccounts = [];
let deploySigner = null;
async function initBlockchain() {
  try {
    provider = new ethers.JsonRpcProvider(GANACHE_RPC);
    const accounts = await provider.listAccounts();
    ganacheAccounts = accounts.map(a => a.address);
    deploySigner = await provider.getSigner(0);
    console.log(`Blockchain connected! Found ${ganacheAccounts.length} Ganache accounts.`);
    const deployFilePath = path.join(__dirname, 'deployed-contract.json');
    if (fs.existsSync(deployFilePath)) {
      const deployData = JSON.parse(fs.readFileSync(deployFilePath, 'utf8'));
      ledgerContract = new ethers.Contract(deployData.ledgerAddress, deployData.ledgerAbi, deploySigner);
      tokenContract = new ethers.Contract(deployData.tokenAddress, deployData.tokenAbi, deploySigner);
      console.log(`Connected to MedicalLedger at: ${deployData.ledgerAddress}`);
      console.log(`Connected to MedCredit (ERC-20) at: ${deployData.tokenAddress}`);
    } else {
      console.warn('deployed-contract.json not found yet. Run npm run deploy.');
    }
  } catch (err) {
    console.warn('Ganache is not running yet. Run npm run ganache in Terminal 1.');
  }
}
initBlockchain();
// Helpers
function generateHealthUID() {
  return `NH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}
function generateDoctorID() {
  return `DOC-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}
function computeRecordHash(patient_uid, doctor_id, diagnosis, symptoms, prescription, notes) {
  const content = `${patient_uid}|${doctor_id}|${diagnosis}|${symptoms || ''}|${prescription || ''}|${notes || ''}`;
  const sha256 = crypto.createHash('sha256').update(content).digest('hex');
  return `0x${sha256}`;
}
// --- API ROUTES ---
// Patients
app.post('/api/patients', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Patient name required.' });
  const healthUID = generateHealthUID();
  const stmt = db.prepare('INSERT INTO patients (health_uid, name) VALUES (?, ?)');
  stmt.run(healthUID, name.trim(), function (err) {
    if (err) return res.status(500).json({ error: err.message });
    logAudit('PATIENT', healthUID, 'PATIENT_REGISTERED', healthUID);
    res.status(201).json({ message: 'Patient registered', health_uid: healthUID, name: name.trim() });
  });
  stmt.finalize();
});
app.get('/api/patients', (req, res) => {
  db.all('SELECT health_uid, name, created_at FROM patients ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});
// Doctors (With Automatic 100 MEDC Airdrop)
app.post('/api/doctors', async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Doctor name required.' });
  const doctorID = generateDoctorID();
  
  db.get('SELECT COUNT(*) as count FROM doctors', async (err, row) => {
    let assignedWallet = null;
    if (ganacheAccounts.length > 0) {
      const idx = ((row ? row.count : 0) + 1) % ganacheAccounts.length;
      assignedWallet = ganacheAccounts[idx];
    } else {
      assignedWallet = ethers.Wallet.createRandom().address;
    }
    // Airdrop 100 MEDC to doctor's wallet
    if (tokenContract && assignedWallet) {
      try {
        console.log(`[ERC-20] Airdropping 100 MEDC to doctor wallet: ${assignedWallet}...`);
        const tx = await tokenContract.faucet(assignedWallet);
        await tx.wait();
        console.log(`[ERC-20] ✅ Airdrop complete!`);
      } catch (tErr) {
        console.warn('[ERC-20 Error]:', tErr.message);
      }
    }
    const stmt = db.prepare('INSERT INTO doctors (doctor_id, name, wallet_address) VALUES (?, ?, ?)');
    stmt.run(doctorID, name.trim(), assignedWallet, function (err) {
      if (err) return res.status(500).json({ error: err.message });
      logAudit('DOCTOR', doctorID, 'DOCTOR_REGISTERED', 'SYSTEM');
      res.status(201).json({
        message: 'Doctor registered and received 100 MEDC access credits!',
        doctor_id: doctorID,
        name: name.trim(),
        wallet_address: assignedWallet
      });
    });
    stmt.finalize();
  });
});
app.get('/api/doctors', (req, res) => {
  db.all('SELECT doctor_id, name, wallet_address, created_at FROM doctors ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});
// STAGE 7: Token Balance and Faucet Endpoints
app.get('/api/tokens/balance/:address', async (req, res) => {
  const address = req.params.address;
  if (!tokenContract || !ethers.isAddress(address)) {
    return res.json({ balance: "0", formatted: "0 MEDC" });
  }
  try {
    const rawBal = await tokenContract.balanceOf(address);
    const formatted = ethers.formatEther(rawBal);
    res.json({ balance: formatted, formatted: `${Math.floor(Number(formatted))} MEDC` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/tokens/faucet', async (req, res) => {
  const { address } = req.body;
  if (!tokenContract || !ethers.isAddress(address)) {
    return res.status(400).json({ error: 'Valid address required.' });
  }
  try {
    const tx = await tokenContract.faucet(address);
    await tx.wait();
    const rawBal = await tokenContract.balanceOf(address);
    const formatted = ethers.formatEther(rawBal);
    res.json({ message: 'Claimed +100 MEDC!', balance: `${Math.floor(Number(formatted))} MEDC` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Consent (Doctor spends 5 MEDC to request access)
app.post('/api/access/request', async (req, res) => {
  const { patient_uid, doctor_id } = req.body;
  db.get('SELECT wallet_address FROM doctors WHERE doctor_id = ?', [doctor_id.trim()], async (err, doc) => {
    if (err || !doc) return res.status(404).json({ error: 'Doctor not found.' });
    // Deduct 5 MEDC fee if token contract is active
    if (tokenContract && doc.wallet_address) {
      try {
        const bal = await tokenContract.balanceOf(doc.wallet_address);
        const fee = ethers.parseEther("5");
        if (bal < fee) {
          return res.status(400).json({ error: 'Insufficient MEDC access credits! (Needs at least 5 MEDC. Click Faucet to claim tokens).' });
        }
        const burnTx = await tokenContract.burn(doc.wallet_address, fee);
        await burnTx.wait();
        logAudit('DOCTOR', doctor_id.trim(), 'SPENT_5_MEDC_ACCESS_FEE', patient_uid.trim());
      } catch (tErr) {
        console.warn('Token fee warning:', tErr.message);
      }
    }
    const query = `
      INSERT INTO access_requests (patient_uid, doctor_id, status, updated_at)
      VALUES (?, ?, 'pending', CURRENT_TIMESTAMP)
      ON CONFLICT(patient_uid, doctor_id) DO UPDATE SET
        status = 'pending',
        updated_at = CURRENT_TIMESTAMP
    `;
    db.run(query, [patient_uid.trim(), doctor_id.trim()], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      logAudit('DOCTOR', doctor_id.trim(), 'ACCESS_REQUESTED', patient_uid.trim());
      res.json({ message: 'Access requested (Spent 5 MEDC). Status: PENDING.', status: 'pending' });
    });
  });
});
app.get('/api/access/status', (req, res) => {
  const { patient_uid, doctor_id } = req.query;
  db.get(
    'SELECT status FROM access_requests WHERE patient_uid = ? AND doctor_id = ?',
    [patient_uid.trim(), doctor_id.trim()],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ status: row ? row.status : 'not_requested' });
    }
  );
});
app.get('/api/access/patient/:patient_uid', (req, res) => {
  const query = `
    SELECT ar.id, ar.doctor_id, d.name AS doctor_name, ar.status, ar.updated_at
    FROM access_requests ar
    LEFT JOIN doctors d ON ar.doctor_id = d.doctor_id
    WHERE ar.patient_uid = ?
    ORDER BY ar.updated_at DESC
  `;
  db.all(query, [req.params.patient_uid.trim()], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});
app.post('/api/access/respond', (req, res) => {
  const { request_id, status } = req.body;
  db.get('SELECT patient_uid, doctor_id FROM access_requests WHERE id = ?', [request_id], (err, reqRow) => {
    if (err || !reqRow) return res.status(404).json({ error: 'Request not found.' });
    db.run('UPDATE access_requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, request_id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      const actionName = status === 'approved' ? 'ACCESS_APPROVED' : status === 'denied' ? 'ACCESS_DENIED' : 'ACCESS_REVOKED';
      logAudit('PATIENT', reqRow.patient_uid, actionName, reqRow.patient_uid);
      res.json({ message: `Access updated to ${status.toUpperCase()}`, status });
    });
  });
});
// Create Record
app.post('/api/records', async (req, res) => {
  const { patient_uid, doctor_id, diagnosis, symptoms, prescription, notes } = req.body;
  if (!patient_uid || !doctor_id || !diagnosis) {
    return res.status(400).json({ error: 'Patient UID, Doctor ID, and Diagnosis are required.' });
  }
  db.get(
    'SELECT status FROM access_requests WHERE patient_uid = ? AND doctor_id = ?',
    [patient_uid.trim(), doctor_id.trim()],
    async (err, consent) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!consent || consent.status !== 'approved') {
        return res.status(403).json({ error: 'ACCESS DENIED: Doctor does not have approved access for this Patient.' });
      }
      db.get('SELECT wallet_address FROM doctors WHERE doctor_id = ?', [doctor_id.trim()], async (err, doc) => {
        if (err || !doc) return res.status(404).json({ error: 'Doctor not found.' });
        const doctorWallet = doc.wallet_address || ethers.ZeroAddress;
        const recordHash = computeRecordHash(patient_uid, doctor_id, diagnosis, symptoms, prescription, notes);
        let txHash = null;
        if (ledgerContract) {
          try {
            console.log(`[Blockchain] Mining transaction on Ganache...`);
            const tx = await ledgerContract.addRecord(patient_uid.trim(), doctorWallet, recordHash);
            const receipt = await tx.wait();
            txHash = receipt.hash;
            console.log(`[Blockchain] Transaction Mined: ${txHash}`);
          } catch (bErr) {
            console.error('[Blockchain Error]:', bErr.message);
            return res.status(500).json({ error: 'Blockchain transaction failed: ' + bErr.message });
          }
        }
        const stmt = db.prepare(`
          INSERT INTO medical_records (patient_uid, doctor_id, diagnosis, symptoms, prescription, notes, record_hash, tx_hash)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
          patient_uid.trim(),
          doctor_id.trim(),
          diagnosis.trim(),
          (symptoms || '').trim(),
          (prescription || '').trim(),
          (notes || '').trim(),
          recordHash,
          txHash,
          function (err) {
            if (err) return res.status(500).json({ error: err.message });
            logAudit('DOCTOR', doctor_id.trim(), 'RECORD_CREATED', patient_uid.trim());
            res.status(201).json({
              message: 'Medical record created & stored on-chain successfully!',
              record_id: this.lastID,
              record_hash: recordHash,
              tx_hash: txHash
            });
          }
        );
        stmt.finalize();
      });
    }
  );
});
// View Records
app.get('/api/records/:patient_uid', (req, res) => {
  const patientUID = req.params.patient_uid.trim();
  const viewerID = req.query.viewer_id ? req.query.viewer_id.trim() : null;
  const viewerType = req.query.viewer_type || 'PATIENT';
  db.get('SELECT health_uid, name FROM patients WHERE health_uid = ?', [patientUID], (err, patient) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!patient) return res.status(404).json({ error: 'Patient not found.' });
    const query = `
      SELECT r.*, d.name AS doctor_name, d.wallet_address AS doctor_wallet
      FROM medical_records r
      LEFT JOIN doctors d ON r.doctor_id = d.doctor_id
      WHERE r.patient_uid = ?
      ORDER BY r.id DESC
    `;
    db.all(query, [patientUID], (err, records) => {
      if (err) return res.status(500).json({ error: err.message });
      logAudit(viewerType, viewerID || patientUID, 'RECORD_VIEWED', patientUID);
      res.json({ patient, records });
    });
  });
});
// Verify Record
app.post('/api/records/:id/verify', (req, res) => {
  const recordId = req.params.id;
  db.get('SELECT * FROM medical_records WHERE id = ?', [recordId], async (err, record) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!record) return res.status(404).json({ error: 'Record not found.' });
    const currentHash = computeRecordHash(
      record.patient_uid,
      record.doctor_id,
      record.diagnosis,
      record.symptoms,
      record.prescription,
      record.notes
    );
    if (!ledgerContract) {
      return res.status(500).json({ error: 'Smart contract instance is not loaded.' });
    }
    try {
      const onchainEntries = await ledgerContract.getRecords(record.patient_uid);
      const onchainRecord = onchainEntries.find(entry => entry.recordHash === record.record_hash);
      const onchainHash = onchainRecord ? onchainRecord.recordHash : (record.record_hash || 'None');
      const isAuthentic = (currentHash.toLowerCase() === onchainHash.toLowerCase());
      logAudit('PATIENT', record.patient_uid, isAuthentic ? 'RECORD_VERIFIED_AUTHENTIC' : 'RECORD_VERIFIED_TAMPERED', record.patient_uid);
      res.json({
        record_id: record.id,
        patient_uid: record.patient_uid,
        status: isAuthentic ? 'authentic' : 'tampered',
        is_authentic: isAuthentic,
        current_hash: currentHash,
        onchain_hash: onchainHash,
        tx_hash: record.tx_hash
      });
    } catch (e) {
      res.status(500).json({ error: 'Verification failed: ' + e.message });
    }
  });
});
// Tamper
app.post('/api/records/:id/tamper', (req, res) => {
  const recordId = req.params.id;
  const { new_diagnosis, new_prescription } = req.body;
  db.run(
    `UPDATE medical_records SET 
      diagnosis = ?, 
      prescription = ?, 
      notes = notes || ' [MALICIOUS UNAUTHORIZED EDIT]' 
     WHERE id = ?`,
    [new_diagnosis || 'TAMPERED: Altered Condition', new_prescription || 'TAMPERED: Unauthorized Drug 100mg', recordId],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: `Record #${recordId} was modified in SQLite without updating the blockchain.` });
    }
  );
});
// Audit Logs
app.get('/api/audit-logs', (req, res) => {
  const { patient_uid, actor_id, action } = req.query;
  let query = 'SELECT * FROM audit_log WHERE 1=1';
  const params = [];
  if (patient_uid && patient_uid.trim()) {
    query += ' AND target_patient_uid = ?';
    params.push(patient_uid.trim());
  }
  if (actor_id && actor_id.trim()) {
    query += ' AND actor_id = ?';
    params.push(actor_id.trim());
  }
  if (action && action.trim()) {
    query += ' AND action = ?';
    params.push(action.trim());
  }
  query += ' ORDER BY id DESC LIMIT 100';
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});