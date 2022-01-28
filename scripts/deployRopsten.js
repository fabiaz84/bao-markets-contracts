const {ethers} = require('hardhat');
const fs = require('fs');

const main = async () => {
  let unitrollerContract, comptrollerContract, delegateContract, originalcomptrollerAddress, ERC20Contract,
    USDCERC20Contract, USDCMockFeedContract, JumpRateModelContract, USDCJumpRateModelContract, cERC20Contract,
    cUSDCContract, fedContract, oracleContract, mockFeedContract, CEtherContract, WhitePaperModelContract,
    stabilizerContract;

  ////////////////////////////////////////
  // Contract Deployments
  ////////////////////////////////////////

  // Deploy Oracle
  const oracleFactory = await ethers.getContractFactory('Oracle');
  oracleContract = await oracleFactory.deploy();
  await oracleContract.deployTransaction.wait();
  console.log('Oracle Deployed');

  // Deploy Mock Price Feed
  const mockFeedFactory = await ethers.getContractFactory('MockPriceFeed');
  // Deploy ETH Mock Price Feed
  mockFeedContract = await mockFeedFactory.deploy();
  await mockFeedContract.deployTransaction.wait();
  // Deploy USDC Mock Price Feed
  USDCMockFeedContract = await mockFeedFactory.deploy();
  await USDCMockFeedContract.deployTransaction.wait();
  console.log('Price Feeds Deployed');

  // Deploy Delegate (cERC20 Implementation)
  const delegateFactory = await ethers.getContractFactory('CErc20Delegate');
  delegateContract = await delegateFactory.deploy();
  await delegateContract.deployTransaction.wait();
  // Deploy Comptroller
  const comptrollerFactory = await ethers.getContractFactory('Comptroller');
  comptrollerContract = await comptrollerFactory.deploy();
  await comptrollerContract.deployTransaction.wait();
  originalcomptrollerAddress = comptrollerContract.address;
  // Deploy Unitroller
  const unitrollerFactory = await ethers.getContractFactory('contracts/Comptroller/Unitroller.sol:Unitroller');
  unitrollerContract = await unitrollerFactory.deploy();
  await unitrollerContract.deployTransaction.wait();
  // Set Implementation for Unitroller
  const setPendingImplementationTx = await unitrollerContract._setPendingImplementation(comptrollerContract.address);
  await setPendingImplementationTx.wait();
  const setApproveNewImplementationTx = await comptrollerContract._become(unitrollerContract.address);
  await setApproveNewImplementationTx.wait();
  // We are addressing the Unitroller, which delegates to comptroller
  comptrollerContract = await ethers.getContractAt('Comptroller', unitrollerContract.address);
  console.log('Comptroller Deployed');

  // Deploy synth ERC20 (Underlying token)
  const ERC20Factory = await ethers.getContractFactory('ERC20');
  ERC20Contract = await ERC20Factory.deploy('Bao USD', 'bUSD', '18');
  await ERC20Contract.deployTransaction.wait();
  // Deploy USDC ERC20
  USDCERC20Contract = await ERC20Factory.deploy('USD Coin', 'USDC', '6');
  await USDCERC20Contract.deployTransaction.wait();
  console.log('ERC20s Deployed');

  // Deploy InterestRateModel
  // For Synth
  const JumpRateModelFactory = await ethers.getContractFactory('JumpRateModelV2');
  JumpRateModelContract = await JumpRateModelFactory.deploy(
    '0', // uint baseRatePerYear
    '49999999998268800', //uint multiplierPerYear
    '1089999999998841600', //uint jumpMultiplierPerYear
    '800000000000000000', //uint kink_
    (await ethers.getSigners())[0].address // address owner_
  );
  await JumpRateModelContract.deployTransaction.wait();
  // For USDC
  USDCJumpRateModelContract = await JumpRateModelFactory.deploy(
    '0', // uint baseRatePerYear
    '49999999998268800', //uint multiplierPerYear
    '1089999999998841600', //uint jumpMultiplierPerYear
    '800000000000000000', //uint kink_
    (await ethers.getSigners())[0].address // address owner_
  );
  await USDCJumpRateModelContract.deployTransaction.wait();
  // For ETH
  const WhitePaperModelFactory = await ethers.getContractFactory('WhitePaperInterestRateModel');
  WhitePaperModelContract = await WhitePaperModelFactory.deploy('19999999999728000','99999999998640000');
  await WhitePaperModelContract.deployTransaction.wait();
  console.log('Interest Rates Deployed');

  // Deploy bdSynth
  const cERC20Factory = await ethers.getContractFactory('CErc20Delegator');
  cERC20Contract = await cERC20Factory.deploy(
    ERC20Contract.address,  // address underlying_
    unitrollerContract.address, // ComptrollerInterface comptroller_
    JumpRateModelContract.address,  // InterestRateModel interestRateModel_
    '200000000000000000',   // uint initialExchangeRateMantissa_
    'bao deposited bUSD',   // string memory name_
    'bdUSD',   // string memory symbol_
    '8',   // uint8 decimals_
    (await ethers.getSigners())[0].address, // address payable admin_
    delegateContract.address, // address implementation
    0 // Unused data entry
  );
  await cERC20Contract.deployTransaction.wait();
  // Deploy bdUSDC
  cUSDCContract = await cERC20Factory.deploy(
    USDCERC20Contract.address,  // address underlying_
    unitrollerContract.address, // ComptrollerInterface comptroller_
    USDCJumpRateModelContract.address,  // InterestRateModel interestRateModel_
    '200000000000000000',   // uint initialExchangeRateMantissa_
    'bao deposited USDC',   // string memory name_
    'bdUSDC',   // string memory symbol_
    '8',   // uint8 decimals_
    (await ethers.getSigners())[0].address, // address payable admin_
    delegateContract.address, // address implementation
    0 // Unused data entry
  );
  await cUSDCContract.deployTransaction.wait();
  // Deploy bdETH
  const CEtherFactory = await ethers.getContractFactory('CEther');
  CEtherContract = await CEtherFactory.deploy(
    unitrollerContract.address, // ComptrollerInterface comptroller_
    WhitePaperModelContract.address,  // InterestRateModel interestRateModel_
    '200000000000000000',   // uint initialExchangeRateMantissa_
    'bao deposited ETH',   // string memory name_
    'bdETH',   // string memory symbol_
    '8',   // uint8 decimals_
    (await ethers.getSigners())[0].address  // address payable admin_
  );
  await CEtherContract.deployTransaction.wait();
  console.log('bdTokens Deployed');

  // Deploy Fed
  const fedFactory = await ethers.getContractFactory('Fed');
  fedContract = await fedFactory.deploy(cERC20Contract.address, (await ethers.getSigners())[0].address); // CErc20 ctoken_, address gov_
  await fedContract.deployTransaction.wait();
  console.log('Fed Deployed');

  const stabilizerFactory = await ethers.getContractFactory('contracts/InverseFinance/Stabilizer.sol:Stabilizer');
  stabilizerContract = await stabilizerFactory.deploy(
    ERC20Contract.address, // bUSD address
    '0xf80A32A835F79D7787E8a8ee5721D0fEaFd78108', // DAI (ROPSTEN ONLY)
    '0xc189ca9c9168004b3c0eed5409c15a88b87a0702', // governance (ROPSTEN ONLY)
    100, // 1% buy fee
    100, // 1% sell fee
    '1500000000000000000000000'
  );
  await stabilizerContract.deployTransaction.wait();
  console.log('Stabilizer Deployed');

  ////////////////////////////////////////
  // Configurations
  ////////////////////////////////////////

  // Set Eth Price
  let setPriceTx = await mockFeedContract.setPrice(4800 * 1e8);
  await setPriceTx.wait();
  let setDecimalesTx = await mockFeedContract.setDecimals(8);
  await setDecimalesTx.wait();
  // Set USDC Price
  setPriceTx = await USDCMockFeedContract.setPrice(1e8);
  await setPriceTx.wait();
  setDecimalesTx = await USDCMockFeedContract.setDecimals(8);
  await setDecimalesTx.wait();
  // Set USDC erc20 price feed
  const setUSDCPriceTx = await oracleContract.setFeed(cUSDCContract.address, USDCMockFeedContract.address, '6');
  await setUSDCPriceTx.wait();
  // Set fixed 1USD price feed for Synth
  const setSynthPriceTx = await oracleContract.setFixedPrice(cERC20Contract.address, '1000000000000000000');
  await setSynthPriceTx.wait();
  // Set Ethereum price feed
  const setEthPriceTx = await oracleContract.setFeed(CEtherContract.address, mockFeedContract.address, '18');
  await setEthPriceTx.wait();
  console.log('Price Feeds configured');

  // Set the oracle for price queries
  const setOracleTx = await comptrollerContract._setPriceOracle(oracleContract.address);
  await setOracleTx.wait();
  // Set the close Factor
  const setCloseFactorTx = await comptrollerContract._setCloseFactor('500000000000000000');
  await setCloseFactorTx.wait();
  // Set Liquidation Incentive
  const setLiquidationIncentiveTx = await comptrollerContract._setLiquidationIncentive('1100000000000000000');
  await setLiquidationIncentiveTx.wait();
  // Create Synth Market
  const setERC20MarketTx = await comptrollerContract._supportMarket(cERC20Contract.address);
  await setERC20MarketTx.wait();
  // Create ETH Market
  const setEthMarketTx = await comptrollerContract._supportMarket(CEtherContract.address);
  await setEthMarketTx.wait();
  // Create USDC Market
  const setUSDCMarketTx = await comptrollerContract._supportMarket(cUSDCContract.address);
  await setUSDCMarketTx.wait();
  // Set borrowRestricted for synth market to false
  const setBorrowRestrictedSynthTx = await comptrollerContract._setBorrowRestriction([cERC20Contract.address], [false]);
  await setBorrowRestrictedSynthTx.wait();
  // Set the CollateralFactor for Synth
  const setCollateralFactor1Tx = await comptrollerContract._setCollateralFactor(cERC20Contract.address, '250000000000000000');
  await setCollateralFactor1Tx.wait();
  // Set the CollateralFactor for Eth
  const setCollateralFactor2Tx = await comptrollerContract._setCollateralFactor(CEtherContract.address, '650000000000000000');
  await setCollateralFactor2Tx.wait();
  // Set the CollateralFactor for USDC
  const setCollateralFactor3Tx = await comptrollerContract._setCollateralFactor(cUSDCContract.address, '700000000000000000');
  await setCollateralFactor3Tx.wait();
  // Set the IMFFactor for Synth
  const setIMFFactor1Tx = await comptrollerContract._setIMFFactor(cERC20Contract.address, '40000000000000000');
  await setIMFFactor1Tx.wait();
  // Set the IMFFactor for ETH
  const setIMFFactor2Tx = await comptrollerContract._setIMFFactor(CEtherContract.address, '40000000000000000');
  await setIMFFactor2Tx.wait();
  // Set the IMFFactor for USDC
  const setIMFFactor3Tx = await comptrollerContract._setIMFFactor(cUSDCContract.address, '40000000000000000');
  await setIMFFactor3Tx.wait();
  // Set the Maximum amount of borrowed synth tokens
  const setBorrowCapTx = await comptrollerContract._setMarketBorrowCaps([cERC20Contract.address], ['1000000000000000000000000']);
  await setBorrowCapTx.wait();
  console.log('Comptroller Configured');

  // Set the ReserveFactor for Synth
  const setReserveFactor1Tx = await cERC20Contract._setReserveFactor('500000000000000000');
  await setReserveFactor1Tx.wait();
  // Set the ReserveFactor for ETH
  const setReserveFactor2Tx = await CEtherContract._setReserveFactor('500000000000000000');
  await setReserveFactor2Tx.wait();
  // Set the ReserveFactor for USDC
  const setReserveFactor3Tx = await cUSDCContract._setReserveFactor('500000000000000000');
  await setReserveFactor3Tx.wait();
  console.log('dbTokens configured');

  // Allow Fed to mint the synths
  let addMinterTx = await ERC20Contract.addMinter(fedContract.address);
  await addMinterTx.wait();
  // Allow stabilizer to mint the synths
  addMinterTx = await ERC20Contract.addMinter(stabilizerContract.address);
  await addMinterTx.wait();
  // ONLY FOR TESTS: allow user to mint
  addMinterTx = await ERC20Contract.addMinter((await ethers.getSigners())[0].address);
  await addMinterTx.wait();
  addMinterTx = await USDCERC20Contract.addMinter((await ethers.getSigners())[0].address);
  await addMinterTx.wait();
  console.log('Test Minters set');

  // fed expension (aka minting synth tokens and depositing them into the protocol)
  const expansionTx = await fedContract.expansion(ethers.utils.parseEther('1000000'));
  expansionTx.wait();
  console.log('Fed Expanded');

  // In order for the subgraph to work we accrue interest once for every bdToken
  let accrueTx = await cERC20Contract.accrueInterest();
  await accrueTx.wait();
  accrueTx = await cUSDCContract.accrueInterest();
  await accrueTx.wait();
  accrueTx = await CEtherContract.accrueInterest();
  await accrueTx.wait();
  console.log('Interests accrued');

  const addresses = `
    Comptroller: ${originalcomptrollerAddress}
    Unitroller: ${unitrollerContract.address}
    Oracle: ${oracleContract.address}
    Fed: ${fedContract.address}
    Implementation: ${delegateContract.address}
    Stabilizer: ${stabilizerContract.address}
    bdEther: ${CEtherContract.address}
    ETH Interest Rate Model (Whitepaper): ${WhitePaperModelContract.address}
    Mock Price Feed (ETH): ${mockFeedContract.address}
    Synth ERC-20: ${ERC20Contract.address}
    Synth Jump Rate Model: ${JumpRateModelContract.address}
    Synth bdToken: ${cERC20Contract.address}
    USDC ERC-20: ${USDCERC20Contract.address}
    USDC Jump Rate Model: ${USDCJumpRateModelContract.address}
    USDC bdToken: ${cUSDCContract.address}
    Mock Price Feed (USDC): ${USDCMockFeedContract.address}
  `

  // Print all addresses
  console.log('----------------------------------------------------------------------------');
  console.log('Deployed Addresses:');
  console.log(addresses);
  console.log('----------------------------------------------------------------------------');
  // Save Addresses to txt File for tests
  const content = originalcomptrollerAddress + ','
    + unitrollerContract.address + ','
    + oracleContract.address + ','
    + ERC20Contract.address + ','
    + JumpRateModelContract.address + ','
    + cERC20Contract.address + ','
    + fedContract.address + ','
    + WhitePaperModelContract.address + ','
    + CEtherContract.address + ','
    + mockFeedContract.address + ','
    + USDCERC20Contract.address + ','
    + USDCJumpRateModelContract.address + ','
    + cUSDCContract.address + ','
    + USDCMockFeedContract.address
  fs.writeFileSync('./deployedContracts.txt', content, err => {
    if (err) return console.error(err)
    console.log("Addresses written to deployedContracts.txt")
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });