import latestTime from 'zeppelin-solidity/test/helpers/latestTime';
import increaseTime, { duration } from 'zeppelin-solidity/test/helpers/increaseTime';
import expectThrow from 'zeppelin-solidity/test/helpers/expectThrow';
import ether from 'zeppelin-solidity/test/helpers/ether';
import moment from 'moment';

const Crowdsale = artifacts.require('./Crowdsale.sol')
const DefaultToken = artifacts.require('./DefaultToken.sol')
const UserRegistry = artifacts.require('./UserRegistry.sol')

let crowdsale, registry, token, debugHandler, accounts,
    ownerSig, buyerSig

function bn (from) {
  return new web3.BigNumber(from)
}

function tokens(n) {
  return ether(n)
}

function tokensWithBonus(n, b) {
  return tokens(n).mul(b).div(10000).add(tokens(n))
}

function numberToBytearray(long, size) {
  // we want to represent the input as a 8-bytes array
  const byteArray = Array(size).fill(0);

  for (let index = byteArray.length - 1; index >= 0; index-- ) {
      let byte = long & 0xff;
      byteArray[index] = byte;
      long = (long - byte) / 256 ;
  }

  return byteArray;
}
function toHex(bytes) {
  let out = '0x'
  for (let index = 0; index < bytes.length; index++) {
    let byte = bytes[index]
    out += ('00' + (byte & 0xFF).toString(16)).slice(-2)
  }
  
  return out
}

function toBytes(bn) {
  return toHex(numberToBytearray(bn.toNumber(), 32))
}

function hexToBytes(hexString) {
  let out = []
  for(let index = 2; index < hexString.length; index += 2) {
    out.push(`0x${hexString[index]}${hexString[index+1]}`)
  }

  return out
}

function setFlags (crowdsale, flags, sig) {
  const flagsMap = {
    whitelisted: 0,
    knownOnly: 1,
    amountBonus: 2,
    earlyBonus: 3,
    tokenExcange: 4,
    allowToIssue: 5,
    disableEther: 6,
    extraDistribution: 7,
    transferShipment: 8,
    cappedInEther: 9,
    personalBonuses: 10,
    allowClaimBeforeFinalization: 11
  }

  let flagArgs = Array(Object.keys(flagsMap).length).fill().map(e => false)
  for (let key in flags) {
    if (typeof flagsMap[key] === 'undefined') {
      throw new Error(`undefined arg key: ${key}`)
    }

    flagArgs[flagsMap[key]] = true
  }

  sig = sig || {}

  return crowdsale.setFlags(...flagArgs, sig)
}

async function makeContext() {
  registry = await UserRegistry.new(ownerSig)
  token = await DefaultToken.new('Test Token', 'TST', 18, registry.address, ownerSig)
  crowdsale = await Crowdsale.new(ownerSig)
  if (crowdsale.Debug) {
    debugHandler = crowdsale.Debug({}, { fromBlock: 0, toBlock: 'latest'})
    debugHandler.watch((error, result) => {
      if (error) { return console.error(error) }
      return console.log('\t\t\t\tlog: ', result.args.message)
    })
  }

  await registry.addSystem(crowdsale.address, ownerSig)

  await crowdsale.setToken(token.address, ownerSig)

  const time = latestTime()
  await crowdsale.setTime(time - duration.days(1), time + duration.days(30), ownerSig)
  await crowdsale.setPrice(ether(1).div(10), ownerSig) // 1 eth -> 10 tokens
  await crowdsale.setWallet(accounts[5], ownerSig)
  await crowdsale.setSoftHardCaps(
    tokens(1e5), // soft cap is 100k
    tokens(1e6)  // hard cap is 1kk
  )  
  await token.transferOwnership(crowdsale.address, ownerSig)
}


async function cleanContext() {
  if (debugHandler) {
    await debugHandler.stopWatching()
  }
}

contract('crowdsale', _accs => {
  accounts = _accs
  ownerSig = { from: accounts[0] }
  buyerSig = { from: accounts[1] }

  describe('setup tests', async () => {
    before(async () => await makeContext())
    after(async () => await cleanContext())
    
    it('allow owner to setup flags', async () => {
      await setFlags(crowdsale, {
        whitelisted:      true,
        knownOnly:        true,
        amountBonus:      true,
        earlyBonus:       true,
        tokenExcange:     true,
        allowToIssue:     true,
        extraDistribution: true,
        transferShipment:  true,
        cappedInEther:    true,
        personalBonuses:  true
      }, ownerSig)

      assert(await crowdsale.isWhitelisted(), 'should be whitelisted')
      assert(await crowdsale.isKnownOnly(), 'should be known only')
      assert(await crowdsale.isAmountBonus(), 'shold be amount bonus')
      assert(await crowdsale.isTokenExchange(), 'should be a token exchange')
      assert(await crowdsale.isAllowToIssue(), 'should be issue allow')
      assert(await crowdsale.isExtraDistribution(), 'should be extra distirbution')
      assert(await crowdsale.isTransferShipment(), 'should be transfer shipment')
      assert(await crowdsale.isCappedInEther(), 'should be capped in ether')
      assert(await crowdsale.isPersonalBonuses(), 'should be personal bonuses')
    })

    it('allow owner to resetup flags', async () => {
      await setFlags(crowdsale, {}, ownerSig);
      
      assert(!(await crowdsale.isWhitelisted()), 'shouldn\'t be whitelisted')
      assert(!(await crowdsale.isKnownOnly()), 'shouldn\'t be known only')
      assert(!(await crowdsale.isAmountBonus()), 'sholdn\'t be amount bonus')
      assert(!(await crowdsale.isTokenExchange()), 'shouldn\'t be a token exchange')
      assert(!(await crowdsale.isAllowToIssue()), 'shouldn\'t be issue allow')
      assert(!(await crowdsale.isExtraDistribution()), 'shouldn\'t be extra distirbution')
      assert(!(await crowdsale.isTransferShipment()), 'shouldn\'t be transfer shipment')
      assert(!(await crowdsale.isCappedInEther()), 'shouldn\'t be capped in ether')
      assert(!(await crowdsale.isPersonalBonuses()), 'shouldn\'t be a personal bonuses')
    })
    
    it('reject anyone to setup flags', async () => {
      await expectThrow(setFlags(crowdsale, { whitelisted: false }, buyerSig))
    })

    it('should be sanable', async() => {
      await crowdsale.saneIt(ownerSig)
      let sane = await crowdsale.state()
      assert(sane.eq(1), `not ready yet? state is ${sane}`)
    })
    
    it('reject setup flags after sanetize', async () => {
      await expectThrow(setFlags(crowdsale, { whitelisted: true }, ownerSig))
    })

    it('should allow to buy', async () => {
      await crowdsale.buyTokens(accounts[1], { value: ether(1), from: accounts[1] })
    })
  })

  describe('features tests', async () => {
    describe('min amount', async () => {
      before(makeContext)
      after(cleanContext)

      it('disallow anyone to set minimum', async () => {
        await expectThrow(
          crowdsale.setMinimum(ether(100), false, buyerSig)
        )
        await expectThrow(
          crowdsale.setMinimum(tokens(1), true, buyerSig)
        )
        await expectThrow(
          crowdsale.setMinimum(0, true, buyerSig)
        )
      })
      it('allow owner to set minimum', async () => {
        await crowdsale.setMinimum(ether(5), false)
        await crowdsale.saneIt()
      })
      it('reject transaction less than min', async () => {
        await expectThrow(
          crowdsale.buyTokens(accounts[1], { value: ether(1), from: accounts[1] })
        )
      })
      it('accept transaction more than min', async () => {
        await crowdsale.buyTokens(accounts[1], { value: ether(6), from: accounts[1] })
      })

      it('allow to change minimum in sale process', async () => {
        await crowdsale.setMinimum(ether(0.1), false)
      })
      
      it('accept transaction more than with new min', async () => {
        await crowdsale.buyTokens(accounts[1], { value: ether(1), from: accounts[1] })
      })
    })
    describe('known users', async () => {
      before(async () => await makeContext())
      after(async () => await cleanContext())
      
      it('disallow anyone to set only known', async () => {
        await expectThrow(setFlags(crowdsale, { knownOnly: true }, buyerSig))
      })

      it('allow owner to set only known beneficiaries', async () => {
        await setFlags(crowdsale, {
          knownOnly: true
        }, ownerSig)

        assert(await crowdsale.isKnownOnly(), 'should be known only')
      })

      it('reject sanetize without registry', async () => {
        await expectThrow(crowdsale.saneIt(ownerSig))
      })

      it('sanetize with registry', async () => {
        await crowdsale.setRegistry(registry.address)
        await crowdsale.saneIt(ownerSig)
      })

      it('disallow unkown', async () => {
        await expectThrow(crowdsale.buyTokens(accounts[1], { value: ether(1), from: accounts[1] }))
      })

      it('allow after add', async () => {
        await registry.addAddress(accounts[1], ownerSig)
        await crowdsale.buyTokens(accounts[1], { value: ether(1), from: accounts[1] })
      })
    })

    describe('whitelisting', async () => {
      before(async () => await makeContext())
      after(async () => await cleanContext())
      it('disallow anyone to set whitelisting', async () => {
        await expectThrow(setFlags(crowdsale, { whitelisted: true }, buyerSig))
      })
      it('allow owner to set whitelisting', async () => {
        await setFlags(crowdsale, {
          whitelisted: true
        }, ownerSig)
        assert(await crowdsale.isWhitelisted(), 'should be whitelisted')
        await crowdsale.saneIt()
      })
      it('disallow non whitelisted user', async () => {
        await expectThrow(crowdsale.buyTokens(accounts[1], { value: ether(1), from: accounts[1] }))
      })
      it('reject adding without rights', async () => {
        await expectThrow(crowdsale.addToWhitelist(accounts[1], ether(1), ether(3), buyerSig))
      })
      it('disallow less than min amount', async () => {
        await crowdsale.addToWhitelist(
          accounts[1],
          ether(1),
          ether(3),
          ownerSig
        )

        await expectThrow(
          crowdsale.buyTokens(
            accounts[1],
            { value: ether(0.1), from: accounts[1] }
          )
        )
      })
      it('disallow more than max amount', async () => {
        await expectThrow(
          crowdsale.buyTokens(
            accounts[1],
            { value: ether(5), from: accounts[1] }
          )
        )
      })
      it('allow after whitelisting', async () => {
        await crowdsale.buyTokens(
          accounts[1], 
          { value: ether(2), from: accounts[1] }
        )
      })
      it('replace min/max amounts', async () => {
        await crowdsale.addToWhitelist(
          accounts[1],
          ether(3),
          ether(4),
          ownerSig
        )        
      })
      it('reject less then min after replace', async () => {
        await expectThrow(
          crowdsale.buyTokens(
            accounts[1],
            { value: ether(0.5), from: accounts[1] }
          )
        )
      })
      it('allow if sum enough', async () => {
        await crowdsale.buyTokens(
          accounts[1],
          { value: ether(1.1), from: accounts[1] }
        )
      })
      it('reject if sum more than max limit', async () => {
        await expectThrow(
          crowdsale.buyTokens(
            accounts[1],
            { value: ether(3), from: accounts[1] }
          )
        )
      })
    })

    describe('buy with tokens', async () => {
      let tokenA, tokenB
      before(async () => {
        await makeContext()
        tokenA = await DefaultToken.new('Extra Token A', 'EXC', 18, registry.address, ownerSig)
        await tokenA.mint(accounts[1], 10000 * 1e18, ownerSig)
        tokenB = await DefaultToken.new('Extra Token B', 'EXB', 18, registry.address, ownerSig)
        await tokenB.mint(accounts[1], 10000 * 1e18, ownerSig)
      })
      after(async () => await cleanContext())
      it('disallow anyone to set token exchange', async () => {
        await expectThrow(setFlags(crowdsale, { tokenExcange: true }, buyerSig))
      })
      it('allow owner to set token exchange', async () => {
        await setFlags(crowdsale, {
          tokenExcange: true
        }, ownerSig)
        assert(await crowdsale.isTokenExchange(), 'should be whitelisted')
      })
      it('disallow anyone to setup buy with tokens', async () => {
        await expectThrow(crowdsale.setTokenExcange(tokenA.address, ether(0.1), buyerSig))
      })
      it('allow owner to setup buy with token', async () => {
        await crowdsale.setTokenExcange(tokenA.address, ether(0.1), ownerSig)
        await crowdsale.saneIt(ownerSig)
        const rate = await crowdsale.tokensValues(tokenA.address)
        assert(rate.eq(ether(0.1)), 'incorrect rate')
      })
      it('reject setup allowed token after sanitaze', async () => {
        await expectThrow(crowdsale.setTokenExcange(tokenB.address, ether(0.01), ownerSig))
      })
      it('reject change conversion rate from anyone', async () => {
        await expectThrow(crowdsale.updateTokenValue(tokenA.address, ether(0.01), buyerSig))
        const rate = await crowdsale.tokensValues(tokenA.address)
        assert(rate.eq(ether(0.1)), 'incorrect rate')
      })
      it('change conversion rate', async () => {
        await crowdsale.updateTokenValue(tokenA.address, ether(0.01), ownerSig)
        const rate = await crowdsale.tokensValues(tokenA.address)
        assert(rate.eq(ether(0.01)), 'incorrect rate')
      })
      it('reject tx with incorrect token value', async () => {
        await crowdsale.updateTokenValue(tokenA.address, ether(0.1), ownerSig)
        await expectThrow(tokenA.approveAndCall(crowdsale.address, 100 * 1e18, toBytes(bn(10)), buyerSig))
      })
      it('raise wei with tokens', async () => {
        await crowdsale.updateTokenValue(tokenA.address, ether(0.01), ownerSig)
        const raisedBefore = await crowdsale.weiRaised()
        const rate = await crowdsale.tokensValues(tokenA.address)
        const bytes = toBytes(rate)
        const balanceBefore = await tokenA.balanceOf(buyerSig.from)
        await registry.addSystem(crowdsale.address, ownerSig)
        await tokenA.approveAndCall(crowdsale.address, 100 * 1e18, bytes, buyerSig)
        const raisedAfter = await crowdsale.weiRaised()
        const balanceAfter = await tokenA.balanceOf(buyerSig.from)

        assert(raisedAfter.sub(raisedBefore).div(1e18).eq(1), `should raise wei amount on 1 ETH, but ${raisedAfter.sub(raisedBefore).div(1e18).toString(10)}`)
        assert(balanceBefore.sub(balanceAfter).div(1e18).eq(100), `token balance should decrease on 100, but decreased on ${balanceBefore.sub(balanceAfter).div(1e18).toString(10)}`)
      })

      it('reject tx with unkown token', async () => {
        await expectThrow(tokenB.approveAndCall(crowdsale.address, 10 * 1e18, toBytes(bn(0)), buyerSig))
      })
    })

    describe('bonuses', async () => {
      describe('personal bonuses', () => {
        before(async () => await makeContext())
        after(async () => await cleanContext())
        it('disallow anyone to add personal bonus', async () => {
          await expectThrow(setFlags(crowdsale, { personalBonuses: true }, buyerSig))
          await expectThrow(crowdsale.setPersonalBonus(accounts[1], 2000, 0, 0, buyerSig))
        })
        it('allow owner to add personal bonus', async () => {
          await setFlags(crowdsale, { personalBonuses: true }, ownerSig)
          await crowdsale.saneIt()
          await crowdsale.setPersonalBonus(accounts[1], 2000, 0, 0, ownerSig)
          const bonusRecord = await crowdsale.personalBonuses(accounts[1])
          const bonus = bonusRecord[0]
          assert(bonus.eq(2000))
        })
        it('personal bonus calculation', async () => {
          let calculation = await crowdsale.calculateEthAmount(
            accounts[1],
            ether(1),
            latestTime(),
            0
          )

          assert(
            calculation[1].eq(tokens(12)), 
            `unxpected calculation result: ${calculation[1].div(1e18).toString(10)}`
          )

          // get before balances
          const beneficiaryBalanceBefore = await token.balanceOf(accounts[1])
          // buy tokens with acc 1
          await crowdsale.buyTokens(accounts[1], { value: ether(1), from: accounts[1] })
          // get changed balances
          const beneficiaryBalanceAfter = await token.balanceOf(accounts[1])
          assert(
            beneficiaryBalanceAfter.sub(beneficiaryBalanceBefore).eq(tokens(12)), 
            `unxpected change beneficiary balance: ${beneficiaryBalanceAfter.sub(beneficiaryBalanceBefore).div(1e18).toString(10)}`
          )
        })
        it('referal shipment', async () => {
          // Replace bonus to add referal with 5% bonus
          await crowdsale.setPersonalBonus(accounts[1], 3500, accounts[2], 500, ownerSig)

          // get before balances
          const beneficiaryBalanceBefore = await token.balanceOf(accounts[1])
          const referalBalanceBefore = await token.balanceOf(accounts[2])
          // buy tokens with acc 1
          await crowdsale.buyTokens(accounts[1], { value: ether(1), from: accounts[1] })

          // get changed balances
          const beneficiaryBalanceAfter = await token.balanceOf(accounts[1])
          const referalBalanceAfter = await token.balanceOf(accounts[2])

          assert(
            beneficiaryBalanceAfter.sub(beneficiaryBalanceBefore).eq(tokens(13.5)), 
            `unxpected change beneficiary balance: ${beneficiaryBalanceAfter.sub(beneficiaryBalanceBefore).div(1e18).toString(10)}`
          )
          assert(
            referalBalanceAfter.sub(referalBalanceBefore).eq(tokens(13.5 * 0.05)), 
            `unxpected change referal balance: ${referalBalanceAfter.sub(referalBalanceBefore).div(1e18).toString(10)}`
          )
        })
      })

      describe('amount bonuses', () => {
        before(async () => await makeContext())
        after(async () => await cleanContext())
        it('disallow anyone to add amount bonuses', async () => {
          await expectThrow(setFlags(crowdsale, { amountBonus: true }, buyerSig))
          await expectThrow(crowdsale.setAmountBonuses(
            [ ether(10), ether(30), ether(50) ],
            [      1000,      1500,      2000 ],
            buyerSig
          ))
        })
        it('allow owner to add amount bonuses', async () => {
          await setFlags(crowdsale, { amountBonus: true }, ownerSig)
          /* Amount bonuses table:
           * | from   | to      | bonus %   |
           * | 10     | 30      | 10%       | 
           * | 30     | 50      | 15%       |
           * | 50     | --      | 20%       |
           */
          await crowdsale.setAmountBonuses(
            [ ether(10), ether(30), ether(50) ],
            [      1000,      1500,      2000 ],
            ownerSig
          )
          await crowdsale.saneIt(ownerSig)
        })
        it('disallow to add amount bonuses after sanetize', async () => {
          await expectThrow(crowdsale.setAmountBonuses(
            [ ether(10), ether(30), ether(50) ],
            [      1000,      1500,      2000 ],
            ownerSig
          ))
        })
        it('amount bonuses calculation test', async () => {          
          let calculation1 = await crowdsale.calculateEthAmount(
            accounts[1],
            ether(1),
            latestTime(),
            0
          )
          let calculation2 = await crowdsale.calculateEthAmount(
            accounts[2],
            ether(15),
            latestTime(),
            0
          )
          let calculation3 = await crowdsale.calculateEthAmount(
            accounts[3],
            ether(35),
            latestTime(),
            0
          )

          // inclusive test
          let calculation4 = await crowdsale.calculateEthAmount(
            accounts[4],
            ether(50),
            latestTime(),
            0
          )

          assert(
            calculation1[1].eq(tokensWithBonus(10, 0)), 
            `unxpected calculation result \ngot: ${calculation1[1].div(1e18).toString(10)} expect: ${tokens(10).toString(10)}`
          )
          assert(
            calculation2[1].eq(tokensWithBonus(150, 1000)),
            `unxpected calculation result: \ngot: ${calculation2[1].div(1e18).toString(10)} expect: ${tokensWithBonus(150, 1000).toString(10)}`
          )
          assert(
            calculation3[1].eq(tokensWithBonus(350, 1500)),
            `unxpected calculation result: \ngot: ${calculation3[1].div(1e18).toString(10)} expect: ${tokensWithBonus(350, 1500).toString(10)}`
          )
          assert(
            calculation4[1].eq(tokensWithBonus(500, 2000)),
            `unxpected calculation result: \ngot: ${calculation4[1].div(1e18).toString(10)} expect: ${tokensWithBonus(500, 2000).toString(10)}`
          )
        })
      })

      describe('time bonuses', () => {
        before(async () => await makeContext())
        after(async () => await cleanContext())
        it('disallow anyone to add time bonuses', async () => {
          await expectThrow(setFlags(crowdsale, { earlyBonus: true}, buyerSig))
          await expectThrow(crowdsale.setTimeBonuses(
            [ duration.days(5), duration.days(10), duration.days(20) ],
            [             1500,              1000,               500 ],
            buyerSig
          ))
        })
        it('allow owner to add time bonuses', async () => {
          await setFlags(crowdsale, { earlyBonus: true }, ownerSig)
          /* Time bonuses table:
           * | first N      | bonus %   |
           * | 5 days       | 15%       | 
           * | 10 days      | 5%        |
           * | 20 days      | 3%        |
           */
          await crowdsale.setTimeBonuses(
            [ duration.days(5), duration.days(10), duration.days(20) ],
            [             1500,              1000,               500 ],
            ownerSig
          )

          await crowdsale.saneIt()
        })
        it('allow owner to add extra bonuses', async () => {
          await crowdsale.setTimeBonuses(
            [ duration.days(30) ],
            [               200 ],
            ownerSig
          )
        })
        it('disallow owner to add past bonuses', async () => {
          await expectThrow(
            crowdsale.setTimeBonuses(
              [ duration.days(10) ],
              [              2000 ],
              ownerSig
            )
          )
        })
        // ! Not needed anymore, because bonuses is changable after sanetize with a business rules since 02.2018
        // it('disallow to add time bonuses after sanetize', async () => {
        //   await expectThrow(
        //     crowdsale.setTimeBonuses(
        //       [ duration.days(5), duration.days(10), duration.days(20) ],
        //       [             1500,              1000,               500 ],
        //       ownerSig
        //     )
        //   )
        // })
        it('time bonuses calculation max sale', async () => {
          let calculation = await crowdsale.calculateEthAmount(
            accounts[1],
            ether(1),
            latestTime() + duration.hours(2),
            0
          )

          assert(
            calculation[1].eq(tokensWithBonus(10, 1500)), 
            `unxpected calculation result: \ngot: ${calculation[1].toString(10)} expected ${tokensWithBonus(10, 1500)}`
          )
        })
        it('time bonuses calculation before 10 days', async () => {
          let calculation = await crowdsale.calculateEthAmount(
            accounts[1],
            ether(1),
            latestTime() + duration.days(6),
            0
          )

          assert(
            calculation[1].eq(tokensWithBonus(10, 1000)), 
            `unxpected calculation result: \ngot: ${calculation[1].toString(10)} expected ${tokensWithBonus(10, 1000)}`
          )
        })
        it('time bonuses calculation before day 20', async () => {
          let calculation = await crowdsale.calculateEthAmount(
            accounts[1],
            ether(1),
            latestTime() + duration.days(14),
            0
          )

          assert(
            calculation[1].eq(tokensWithBonus(10, 500)), 
            `unxpected calculation result: \ngot: ${calculation[1].toString(10)} expected ${tokensWithBonus(10, 500)}`
          )
        })

        it('time bonuses calculation in added bonuses', async () => {
          let calculation = await crowdsale.calculateEthAmount(
            accounts[1],
            ether(1),
            latestTime() + duration.days(25),
            0
          )

          assert(
            calculation[1].eq(tokensWithBonus(10, 200)), 
            `unxpected calculation result: \ngot: ${calculation[1].toString(10)} expected ${tokens(10)}`
          )
        })
        
        it('time bonuses calculation after bonuses', async () => {
          let calculation = await crowdsale.calculateEthAmount(
            accounts[1],
            ether(1),
            latestTime() + duration.days(35),
            0
          )

          assert(
            calculation[1].eq(tokens(10)), 
            `unxpected calculation result: \ngot: ${calculation[1].toString(10)} expected ${tokens(10)}`
          )
        })
      })
    })

    describe('extra distribution', async () => {
      before(async () => await makeContext())
      after(async () => await cleanContext())
      it('disallow anyone to set extra distribution', async () => {
        await expectThrow(setFlags(crowdsale, { extraDistribution: true}, buyerSig))
      })
      it('allow owner to set extra distribution', async () => {
        await setFlags(crowdsale, { extraDistribution: true}, ownerSig)
        await crowdsale.setExtraDistribution(accounts[6], 3000) // 30%
        await crowdsale.saneIt()
      })
      it('disallow to set extra distribution after sanetize', async () => {
        await expectThrow(
          crowdsale.setExtraDistribution(accounts[6], 5000) // 50%
        )
      })
      it('should mint extra tokens', async () => {
        const balanceBefore = await token.balanceOf(accounts[6])
        await crowdsale.buyTokens(accounts[1], { value: ether(1), from: accounts[1] })
        const balanceAfter  = await token.balanceOf(accounts[6])
        assert(balanceAfter.sub(balanceBefore).div(1e18).eq(3), `unxpected extra distribution amount: ${balanceAfter.sub(balanceBefore).div(1e18).toString(10)}`)
      })
    })

    describe('capped', async () => {
      describe('in ether', async () => {
        before(async () => await makeContext())
        after(async () => await cleanContext())

        it('disallow anyone to set caps', async () => {
          await expectThrow(setFlags(crowdsale, { cappedInEther: true}, buyerSig))
        })
        it('allow owner to set caps', async () => {
          await setFlags(crowdsale, { cappedInEther: true}, ownerSig)
          await crowdsale.setSoftHardCaps(
            ether(100),
            ether(200),
            ownerSig
          )
          await crowdsale.saneIt()
        })
        it('disallow to set caps after sanetize', async () => {
          await expectThrow(
            crowdsale.setSoftHardCaps(
              ether(10),
              ether(20),
              ownerSig
            )
          )
        })
        it('fail crowdsale then soft cap isn\'t achived', async () => {
          await crowdsale.buyTokens(accounts[5], { value: ether(90), from: accounts[5] })
          assert(!(await crowdsale.success()), 'should fail crowdsale')
        })
        it('success then soft cap is achived', async () => {
          await crowdsale.buyTokens(accounts[5], { value: ether(10), from: accounts[5] })
          assert(await crowdsale.success(), 'should success crowdsale (soft cap is achived')
        })
        it('reject buy when cap is achived', async () => {
          // hard cap achived here
          await crowdsale.buyTokens(accounts[5], { value: ether(100), from: accounts[5] })
          // reject future buy
          await expectThrow(crowdsale.buyTokens(accounts[5], { value: 1, from: accounts[5] }))
        })
      })
    })

    describe('transfer funds', async () => {
      before(async () => await makeContext())
      after(async () => await cleanContext())
      it('disallow anyone to setup wallet', async () => {
        await expectThrow(crowdsale.setWallet(accounts[6], buyerSig))
      })
      it('allow owner to setup wallet', async () => {
        await setFlags(crowdsale, { 
          cappedInEther: true,
          allowClaimBeforeFinalization: true
        }, ownerSig)
        await crowdsale.setWallet(accounts[0], ownerSig)
        await crowdsale.setSoftHardCaps(
          ether(100),
          ether(500)
        )
      })
      
      it('reject setup after sanetize', async () => {
        const wallet = await crowdsale.wallet()
        assert(wallet === accounts[0])
        await crowdsale.saneIt()
        await expectThrow(crowdsale.setWallet(accounts[6], ownerSig))
      })

      it('should hold funds before finalization', async () => {
        const balanceBefore = await web3.eth.getBalance(crowdsale.address)
        await crowdsale.buyTokens(accounts[5], { value: ether(10), from: accounts[5] })
        const balanceAfter = await web3.eth.getBalance(crowdsale.address)
        assert(balanceAfter.sub(balanceBefore).div(1e18).eq(10), `unxpected balance: ${balanceAfter.sub(balanceBefore).div(1e18).toString(10)} ETH`)
      })

      it('should reject claim before softcap', async () => {
        await expectThrow(crowdsale.claimFunds(ownerSig))
      })

      it('should allow to claim after softcap', async () => {
        await crowdsale.buyTokens(accounts[5], { value: ether(91), from: accounts[5] })
        const balanceBefore = await web3.eth.getBalance(accounts[0])
        await crowdsale.claimFunds(ownerSig)
        const balanceAfter = await web3.eth.getBalance(accounts[0])
        assert(balanceAfter.sub(balanceBefore).gt(0))
      })
    })
  })
})