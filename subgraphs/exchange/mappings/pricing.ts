import { log } from '@graphprotocol/graph-ts';
/* eslint-disable prefer-const */
import { BigDecimal, Address } from "@graphprotocol/graph-ts/index";
import { Pair, Token, Bundle } from "../generated/schema";
import { ZERO_BD, factoryContract, ADDRESS_ZERO, ONE_BD } from "./utils";

let WBNB_ADDRESS = "0xc42c30ac6cc15fac9bd938618bcaa1a1fae8501d"; // wnear
let BUSD_WBNB_PAIR = "0x20f8aefb5697b77e0bb835a8518be70775cda1b0"; // wNEAR-USDC created block 50576700

export function getBnbPriceInUSD(): BigDecimal {
  // fetch eth prices for each stablecoin
  let busdPair = Pair.load(BUSD_WBNB_PAIR); // usdc is token1
  if (busdPair !== null) {
    if(busdPair.token0Price && busdPair.token1Price){
      log.info('!!!!!! price {},{}',[busdPair.token0Price.toString(), busdPair.token1Price.toString()])
    }
    return busdPair.token1Price;
  } else {
    log.info('+++++++ not found BusdPair return {}',[ZERO_BD.toString()])
    return ZERO_BD;
  }
}

// token where amounts should contribute to tracked volume and liquidity
let WHITELIST: string[] = [
  "0xc42c30ac6cc15fac9bd938618bcaa1a1fae8501d", // wNear
  "0x20f8aefb5697b77e0bb835a8518be70775cda1b0", // USDC
  "0x4988a896b1227218e4a686fde5eabdcabd91571f", // USDT
  "0x8bec47865ade3b172a928df8f990bc7f2a3b9f79", // Aurora
  "0xc9bdeed33cd01541e1eed10f90519d2c06fe3feb", // wETH
  "0xfa94348467f64d5a457f75f8bc40495d33c65abb", // TRI
  "0xbc8a244e8fb683ec1fd6f88f3cc6e565082174eb", // WBTC
];

// minimum liquidity for price to get tracked
let MINIMUM_LIQUIDITY_THRESHOLD_BNB = BigDecimal.fromString("10");

/**
 * Search through graph to find derived BNB per token.
 * @todo update to be derived BNB (add stablecoin estimates)
 **/
export function findBnbPerToken(token: Token): BigDecimal {
  if (token.id == WBNB_ADDRESS) {
    return ONE_BD;
  }
  // loop through whitelist and check if paired with any
  for (let i = 0; i < WHITELIST.length; ++i) {
    log.debug("get pair {} {}", [token.id, WHITELIST[i]])
    let pairAddress = factoryContract.getPair(Address.fromString(token.id), Address.fromString(WHITELIST[i]));
    if (pairAddress.toHex() != ADDRESS_ZERO) {
      let pair = Pair.load(pairAddress.toHex());
      if (pair.token0 == token.id && pair.reserveBNB.gt(MINIMUM_LIQUIDITY_THRESHOLD_BNB)) {
        let token1 = Token.load(pair.token1);
        return pair.token1Price.times(token1.derivedBNB as BigDecimal); // return token1 per our token * BNB per token 1
      }
      if (pair.token1 == token.id && pair.reserveBNB.gt(MINIMUM_LIQUIDITY_THRESHOLD_BNB)) {
        let token0 = Token.load(pair.token0);
        return pair.token0Price.times(token0.derivedBNB as BigDecimal); // return token0 per our token * BNB per token 0
      }
    }
  }
  return ZERO_BD; // nothing was found return 0
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD.
 * If both are, return average of two amounts
 * If neither is, return 0
 */
export function getTrackedVolumeUSD(
  bundle: Bundle,
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token
): BigDecimal {
  let price0 = token0.derivedBNB.times(bundle.bnbPrice);
  let price1 = token1.derivedBNB.times(bundle.bnbPrice);

  // both are whitelist tokens, take average of both amounts
  if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).plus(tokenAmount1.times(price1)).div(BigDecimal.fromString("2"));
  }

  // take full value of the whitelisted token amount
  if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0);
  }

  // take full value of the whitelisted token amount
  if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount1.times(price1);
  }

  // neither token is on white list, tracked volume is 0
  return ZERO_BD;
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD * 2.
 * If both are, return sum of two amounts
 * If neither is, return 0
 */
export function getTrackedLiquidityUSD(
  bundle: Bundle,
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token
): BigDecimal {
  let price0 = token0.derivedBNB.times(bundle.bnbPrice);
  let price1 = token1.derivedBNB.times(bundle.bnbPrice);

  // both are whitelist tokens, take average of both amounts
  if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).plus(tokenAmount1.times(price1));
  }

  // take double value of the whitelisted token amount
  if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).times(BigDecimal.fromString("2"));
  }

  // take double value of the whitelisted token amount
  if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount1.times(price1).times(BigDecimal.fromString("2"));
  }

  // neither token is on white list, tracked volume is 0
  return ZERO_BD;
}
