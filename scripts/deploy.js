const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
async function main() {
  console.log("Connecting to Ganache at http://127.0.0.1:8545...");
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  const signer = await provider.getSigner(0);
  console.log(`Using deployer account: ${await signer.getAddress()}`);
  // 1. Deploy MedicalLedger
  const ledgerArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, "../artifacts/contracts/MedicalLedger.sol/MedicalLedger.json"), "utf8"));
  const ledgerFactory = new ethers.ContractFactory(ledgerArtifact.abi, ledgerArtifact.bytecode, signer);
  const ledgerContract = await ledgerFactory.deploy();
  await ledgerContract.waitForDeployment();
  const ledgerAddress = await ledgerContract.getAddress();
  console.log("✅ MedicalLedger deployed to:", ledgerAddress);
  // 2. Deploy MedCredit (ERC-20)
  const tokenArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, "../artifacts/contracts/MedCredit.sol/MedCredit.json"), "utf8"));
  const tokenFactory = new ethers.ContractFactory(tokenArtifact.abi, tokenArtifact.bytecode, signer);
  const tokenContract = await tokenFactory.deploy();
  await tokenContract.waitForDeployment();
  const tokenAddress = await tokenContract.getAddress();
  console.log("✅ MedCredit (ERC-20) deployed to:", tokenAddress);
  // Save details
  const deployInfo = {
    ledgerAddress,
    ledgerAbi: ledgerArtifact.abi,
    tokenAddress,
    tokenAbi: tokenArtifact.abi
  };
  fs.writeFileSync(path.join(__dirname, "../deployed-contract.json"), JSON.stringify(deployInfo, null, 2));
  console.log("✅ Saved all contract details to deployed-contract.json");
}
main().catch((err) => {
  console.error("Deploy error:", err);
  process.exit(1);
});