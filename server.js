const Koa = require('koa')
const koaRouter = require('koa-router')
const cors = require('@koa/cors')
const fetch = require('node-fetch')
const { JSDOM } = require('jsdom')
const fs = require('fs')
const { inspect } = require('util')
const { isChinese, isKorean, chineseRegExp } = require('asian-regexps/legacy')

const debug = true

const getPinyinReference = pinyin => {
  let k
  if (typeof pinyin === 'string') {
    k = pinyin
  } else {
    k = pinyin.k
  }
  if (k) {
    const match = k.match(/\(☞([^\(])+/)
    if (match) {
      return match[1]
    }
  }
  return null
}
const getReducedItem = items => {
  if (!(items instanceof Array)) {
    items = [items]
  }
  const reduces = []
  for (const item of items) {
    reduces.push({
      matchType: item.matchType,
      handleEntry: item.handleEntry,
      languageCode: item.languageCode,
      searchTraditionalChineseList: item.searchTraditionalChineseList,
      searchVariantHanziList: item.searchVariantHanziList,
      phonetics: item.searchPhoneticSymbolList.map(psl => psl.phoneticSymbol),
      hasMeanings: item.meansCollector.length > 0
    })
  }
  return reduces.length === 1 ? reduces[0] : reduces
}
/**
 * constants & co
 */
let koreanWordsFile = './words.json'
let words
// the timeout is used to space the ram
// when the data is not requested for some time we clear it from the process
let wordsTimeout
const loadWords = () => {
  if (!words) {
    if (wordsTimeout) {
      clearTimeout(wordsTimeout)
      wordsTimeout = undefined
    }
    try {
      // words = JSON.parse(fs.readFileSync(koreanWordsFile))
      eval(`words=${fs.readFileSync('words_compact.data')}`)
    } catch (e) {
      /* the file was not find */
      fs.writeFileSync(koreanWordsFile, '{}')
      words = {}
    }
    // timeout
    // wordsTimeout = setTimeout(() => {
    //   words = undefined
    // }, 1000 * 60 * 10) // 10 minutes
  }
}
const saveWords = async () => {
  if (debug) {
    return
  }
  fs.writeFileSync(koreanWordsFile, JSON.stringify(words))
  // fs.writeFileSync('./words_compact.json', inspect(words, { depth: Infinity, breakLength: Infinity, compact: true }).replace(/(s:|t:|e:|v:|a:|,|{|\[|'|':)\s/g, (m, g) => g).replace(/\s(}|])/g, (m, g) => g))
  fs.writeFileSync(
    'words_compact.data',
    JSON.stringify(words).replace(/"a"/g, 'a').replace(/"s"/g, 's').replace(/"t"/g, 't').replace(/"v"/g, 'v').replace(/"e"/g, 'e').replace(/"k"/g, 'k').replace(/"p"/g, 'p').replace(/"c"/g, 'c').replace(/"ts"/g, 'ts')
  )
}

const app = new Koa()
app.use(cors())

const router = new koaRouter()

/**
 * fetch information about a chinese word,
 * the word should be simplified chinese because the data
 * is fetched from hanyu.baidu.com
 */
const fetchChineseInformationsFromBaidu = async word => {
  const url = `https://hanyu.baidu.com/s?wd=${encodeURIComponent(word)}&ptype=zici`
  console.log(`fetching ${decodeURIComponent(url)}`)
  const response = await fetch(url)

  const document = new JSDOM(await response.text()).window.document
  // if (document.querySelector('#word_bishun') && word.length !== 1) {
  //   return null
  // }
  // const traditionals = document.querySelector('#traditional > span')
  // if (traditionals && traditionals.textContent.trim() !== word) {
  //   return null
  // }
  const spans = [...document.querySelectorAll('[id=pinyin] span')]
  const englishDt = document.querySelector('[id=fanyi-wrapper] .tab-content dt')

  if (spans.length === 0 && !englishDt) {
    return null
  }

  return {
    p: spans.map(element => {
      // text
      let text = element.firstElementChild.textContent
      if (text.trim().startsWith('[')) {
        text = text.trim().slice(1, -1).trim()
      }

      // audio
      let audio = element.lastElementChild.getAttribute('url')

      return { t: text, a: audio }
    }),
    e: englishDt ? englishDt.textContent : undefined
  }
}

const constructFromSimplified = simplified => {
  const object = {
    s: simplified,
    p: []
  }
  for (const trad of words[simplified].t) {
    if (!object.e) {
      object.e = words[trad].e
    }
    for (const pinyin of words[trad].p) {
      const pinyinIndex = object.p.findIndex(p => p.t === pinyin.t)
      if (pinyinIndex >= 0) {
        object.p[pinyinIndex].hanzis.push(words[trad].t)
      } else {
        const clone = Object.assign({}, pinyin)
        clone.hanzis = [words[trad].t]
        object.p.push(clone)
      }
    }
    // object.p.push({
    //   ...words[trad].p
    // })
    // object.p = object.p.concat((({ simplified, ...o }) => ({ ...o }))(words[trad]))
  }
  return object
}

/**
 * Fetch a korean definition from a chinese word.
 */
router.get('/chinese/:word', async ctx => {
  let word = decodeURIComponent(ctx.params.word).replace(/\s/g, '')
  if (word !== '的') {
    word = word.replace(/^的+|的+$/g, '')
  }
  if (word !== '是') {
    word = word.replace(/^是+|是+$/g, '')
  }
  if (word !== '最') {
    word = word.replace(/^最+|最+$/g, '')
  }

  if (word.length > 4) {
    return
  }

  /* verify the provided input is one chinese word */
  const matches = word.match(new RegExp(chineseRegExp, 'g'))
  if (!(matches && matches.length === 1 && matches[0].length === word.length)) {
    ctx.body = {}
    return
  }

  console.log('word:', word)

  /**
   * #getexisting
   */
  const get = word => {
    if (debug) {
      if (!words) {
        words = []
      } else {
        // console.log(words)
      }
    } else {
      loadWords()
    }
    let object = words[word]
    if (object === 0) {
      return {}
    }
    if (object) {
      // we clone the object to prevent modifying the initial data
      object = Object.assign({}, object)
      if (object.p) {
        object.p = Object.assign([], object.p)
      }
      let simplified
      /* simplified */
      if (object.ts) {
        simplified = object
        for (const tradChar of object.ts) {
          let trad = words[tradChar]
          if (trad) {
            trad = Object.assign({}, trad)
            if (trad.p) {
              if (!object.p) {
                object.p = []
              }
              for (const pinyin of trad.p) {
                object.p.push({
                  traditional: tradChar,
                  ...pinyin
                })
              }
            }
          }
        }
      }
      /* traditional */
      if (object.t) {
        simplified = words[object.s]
        if (!object.e && simplified && simplified.e) {
          object.e = simplified.e
        }
      }

      /* resolve audio reference */
      if (simplified) {
        for (const pinyin of object.p) {
          const reference = getPinyinReference(pinyin)
          if (reference && reference === simplified.s) {
            const pinyinIndex = simplified.p.findIndex(p => p.t === pinyin.t)
            if (pinyinIndex >= 0 && simplified.p[pinyinIndex].a) {
              pinyin.a = simplified.p[pinyinIndex].a
            }
          }
        }
      }

      return object
    }

    /* else */
    const wordsArray = Object.values(words)
    // it could be a simplified when the word is length 2
    if (word.length > 1) {
      const simplifiedIndex = wordsArray.findIndex(w => w.s && w.s === word)
      if (simplifiedIndex >= 0) {
        return wordsArray[simplifiedIndex]
      }
    }
    // it could be a variant
    const variantIndex = wordsArray.findIndex(w => w.v && w.v.includes(word))
    if (variantIndex >= 0) {
      return wordsArray[variantIndex]
    }
  }
  const result = get(word)
  if (result) {
    ctx.body = result
    return
  }

  let wordObject
  let wordItems, wordCandidates, zhCandidates, traditionalCandidates, english
  let naverResult
  const fetchNaver = async () => {
    const url = `https://zh.dict.naver.com/api3/zhko/search?query=${encodeURIComponent(word)}`
    console.log(`fetching ${decodeURIComponent(url)}`)
    const response = await fetch(url)

    wordObject = {}
    naverResult = await response.json()
    if (naverResult && (wordItems = naverResult.searchResultMap.searchResultListMap.WORD.items).length > 0) {
      wordCandidates = wordItems.filter(i => {
        if (i.matchType === 'exact:entry') {
          return true
        }
        return false
      })
      zhCandidates = wordCandidates.filter(i => i.languageCode === 'ZHKO')
      traditionalCandidates = zhCandidates.filter(
        i =>
          (i.searchTraditionalChineseList.length > 0 && i.searchTraditionalChineseList.some(tcl => tcl.traditionalChinese === word)) ||
          (i.searchVariantHanziList.length > 0 && i.searchVariantHanziList.some(vhl => vhl.variantHanzi === word)) ||
          i.handleEntry === word
      )
      const englishItem = wordItems.filter(i => i.languageCode === 'ZHEN' && i.handleEntry === word)[0]
      if (englishItem) {
        english = englishItem.meansCollector[0].means.map(m => stripHtmlTags(m.value))
      }
    } else {
      wordItems = undefined
      zhCandidates = undefined
      english = undefined
    }
  }
  await fetchNaver()
  // ctx.body = getReducedItem(zhCandidates)
  // return

  let wordType = 'undefined'
  const determineWordType = () => {
    if (!zhCandidates || zhCandidates.length === 0) {
      return // undefined
    }
    /* get potential traditional characters */
    let traditionals = []
    traditionals = traditionals.concat(zhCandidates.map(i => i.searchTraditionalChineseList.map(o => o.traditionalChinese)).reduce((a, b) => a.concat(b), []))
    // traditionals are also the characters that are in handleEntry and has an variantHanzi that is also
    // in another handleEntry.
    traditionals = traditionals.concat(
      zhCandidates
        .filter(i => i.searchTraditionalChineseList.length === 0 && i.searchVariantHanziList.length > 0 && zhCandidates.some(j => j.handleEntry === i.searchVariantHanziList[0].variantHanzi))
        .map(i => i.handleEntry)
    )
    traditionals = [...new Set(traditionals)]
    console.log('traditionals:', traditionals)

    /* determine the type now */
    if (word.length === 1) {
      if (traditionals.includes(word)) {
        wordType = 'traditional'
      } else if (
        !zhCandidates.some(i => i.handleEntry === word) &&
        zhCandidates.some(i => !i.searchTraditionalChineseList.some(o => o.traditionalChinese === word) && i.searchVariantHanziList.some(o => o.variantHanzi === word))
      ) {
        wordType = 'variant'
      } else {
        wordType = 'simplified'
      }
    } else if (word.length > 1) {
      if (traditionals.length > 1) {
        wordType = traditionals.includes(word) ? 'traditional' : 'simplified'
      } else {
        // we need to check if the handleEntry differ from the word
        wordType = zhCandidates[0].handleEntry === word ? 'simplified' : 'traditional'
      }
    }
    console.log('word type:', wordType)
  }
  determineWordType()

  /**
   * #findtraditional
   * If the word is a variant we should at least find one traditional character
   *********************/
  let fromVariant
  if (wordType === 'variant') {
    fromVariant = word
    word = undefined
    for (const item of zhCandidates) {
      if (item.handleEntry !== fromVariant && item.searchVariantHanziList.some(o => o.variantHanzi === fromVariant) && item.searchTraditionalChineseList.length > 0) {
        word = item.searchTraditionalChineseList[0].traditionalChinese
      }
    }
    if (word === undefined) {
      // we didn't find a traditional character, try to find a handleEntry
      const handleEntries = zhCandidates.filter(i => i.handleEntry !== fromVariant && i.searchVariantHanziList.some(o => o.variantHanzi.indexOf(fromVariant) >= 0))
      if (handleEntries.length > 0) {
        word = handleEntries[0].handleEntry
      } else {
        return
      }
    }
    console.log(`"word" changed to "${word}" from variant "${fromVariant}"`)
    // does the character already exist in the data ?
    const result = get(word)
    if (result) {
      ctx.body = result
      return
    }
    // else
    console.log('no entry found, refetch informations...')
    await fetchNaver()
    determineWordType()
  }

  /**
   * #pinyins
   * Determine the items to
   * be used in the pinyin array construction
   *********************************************/
  let pinyins = []
  if (wordType === 'traditional') {
    wordObject.t = word
    // try to get the simplified form
    const simplifieds = zhCandidates.filter(i => (word.length > 1 && i.handleEntry.trim() !== word) || (word.length === 1 && i.searchTraditionalChineseList.length > 0))
    // console.log(simplifieds)
    if (simplifieds.length > 0) {
      wordObject.s = simplifieds[0].handleEntry.trim()
    }
    if (word.length === 1) {
      pinyins = traditionalCandidates.length > 0 ? traditionalCandidates : zhCandidates.filter(i => i.handleEntry.trim() === word)
    } else {
      pinyins = zhCandidates.filter(i => i.handleEntry.trim() === wordObject.s)
    }

    // if the word is traditional and we found a simplified version
    // we check in the data if the simplified form is not already present
    if (word.length > 1 && wordObject.s) {
      const existing = words[wordObject.s]
      if (existing) {
        existing.t = wordObject.t
        words[existing.t] = existing
        delete words[wordObject.s]
        saveWords()
        ctx.body = existing
        return
      }
    }
  }
  if (wordType === 'simplified') {
    // if (word.length === 1) {
    //   ctx.body = getReducedItem(zhCandidates)
    //   return
    //   pinyins = zhCandidates.filter(
    //     i => i.handleEntry.trim() === word && ((i.searchTraditionalChineseList && i.searchTraditionalChineseList.length > 0) || (i.searchVariantHanziList && i.searchVariantHanziList.length > 0))
    //   )
    // } else {
    pinyins = zhCandidates.filter(i => i.handleEntry === word || i.searchVariantHanziList.map(o => o.variantHanzi).includes(word))
    // }
    wordObject.s = word
    // the pinyins are all the pinyins that has a phonetic bind to it
    // pinyins = zhCandidates.filter(i => i.searchPhoneticSymbolList && i.searchPhoneticSymbolList.length > 0)
  }
  // ctx.body = getReducedItem(pinyins)
  // return

  /**
   * #variants
   */
  // if (zhCandidates && zhCandidates.length > 0) {
  //   const variants = zhCandidates.filter(
  //     i =>
  //       (i.searchTraditionalChineseList.length > 0 && i.searchTraditionalChineseList.some(tcl => tcl.traditionalChinese !== word)) ||
  //       (i.searchVariantHanziList.length > 0 && i.searchVariantHanziList.some(vhl => vhl.variantHanzi !== word))
  //   )
  //   wordObject.v = [
  //     ...new Set(
  //       variants
  //         .map(i => {
  //           const variants = []
  //           if (i.searchTraditionalChineseList.length > 0) {
  //             for (const variant of i.searchTraditionalChineseList) {
  //               if (variant.traditionalChinese !== word) {
  //                 variants.push(variant.traditionalChinese)
  //               }
  //             }
  //           }
  //           if (i.searchVariantHanziList.length > 0) {
  //             for (const variant of i.searchVariantHanziList) {
  //               if (variant.variantHanzi !== word) {
  //                 variants.push(variant.variantHanzi)
  //               }
  //             }
  //           }
  //           return variants
  //         })
  //         .reduce((a, b) => a.concat(b), [])
  //     )
  //   ]
  //   if (wordObject.s && wordObject.v.includes(wordObject.s)) {
  //     wordObject.v.splice(wordObject.v.indexOf(wordObject.s), 1)
  //   }
  //   if (wordObject.v.length === 0) {
  //     delete wordObject.v
  //   }
  // }
  let variants = []
  if (zhCandidates && zhCandidates.length > 0) {
    variants = zhCandidates
      .map(i => {
        return i.searchVariantHanziList.map(o => o.variantHanzi)
      })
      .reduce((a, b) => a.concat(b), [])
    const indexOfWord = variants.indexOf(word)
    variants = [...new Set(variants)]
    if (indexOfWord >= 0) {
      variants.splice(indexOfWord, 1)
    }
  }
  if (wordObject.s) {
    const index = variants.indexOf(wordObject.s)
    if (index) {
      variants.splice(index, 1)
    }
  }
  console.log('variants:', variants)

  /**
   * #pinyinsmap
   * Construct the pinyinsmap
   * the pinyinsmap gather all the traditional
   * characters of the simplified requested form
   **********************************************/
  // ctx.body = getReducedItem(pinyins)
  // return
  let pinyinsMap
  ;(() => {
    let pinyinsArray = []
    let previousPinyin

    for (const item of pinyins) {
      const pinyin = {}
      if (item.searchPhoneticSymbolList.length > 0) {
        pinyin.t = item.searchPhoneticSymbolList[0].phoneticSymbol.toLowerCase().replace(/\([^\)]+\)|\/\/|…/g, '').replace(/‧|·|･/g, ' ').trim()
      }

      if (word.length === 1) {
        //      if (wordType === 'simplified') {
        pinyin.characters = []
        if (item.searchTraditionalChineseList.length > 0) {
          pinyin.characters = pinyin.characters.concat(item.searchTraditionalChineseList.map(o => o.traditionalChinese))
        } else {
          pinyin.characters.push(item.handleEntry)
        }
        // we should determine the characters here
        // the character of the pinyin is either
        // the traditional one
        // pinyin.characters = pinyin.characters.concat(item.searchTraditionalChineseList.map(o => o.traditionalChinese))
        // if (item.searchTraditionalChineseList.length > 0) {
        //   pinyin.character = item.searchTraditionalChineseList[0].traditionalChinese
        // }
        // or the variant
        // if (!pinyin.character && item.searchVariantHanziList.length > 0) {
        //   pinyin.character = item.searchVariantHanziList[0].variantHanzi
        // }
        // or the handleEntry if both not found
        if (!pinyin.characters) {
          pinyin.characters.push(item.handleEntry)
        }

        // append the variants ?
        if (item.searchTraditionalChineseList.length === 0) {
          if (item.searchVariantHanziList.map(o => o.variantHanzi).includes(word)) {
            pinyin.characters.push(word)
          }
          // pinyin.characters = pinyin.characters.concat(item.searchVariantHanziList.map(o => o.variantHanzi))
        }

        pinyin.characters = [...new Set(pinyin.characters)]
        // }
      }

      let koreanDefinition = []
      let part
      for (const collector of item.meansCollector) {
        let meanIndex = 1
        for (const mean of collector.means) {
          part = ''
          if (collector.means.length > 1) {
            part += `${meanIndex++}. `
          }
          if (collector.partOfSpeech) {
            part += `[${collector.partOfSpeech}] `
          }
          if (mean.subjectGroup) {
            part += `(${mean.subjectGroup}) `
          }
          part += `${stripHtmlTags(mean.value)}`
          koreanDefinition.push(part)
        }
      }
      if (koreanDefinition.length > 0) {
        pinyin.k = koreanDefinition.join('\n')
      }

      // if this pinyin has no text, try to append the korean definition to the previous one
      // if (!pinyin.t && pinyin.k) {
      //   if (previousPinyin && previousPinyin.k) {
      //     previousPinyin.k += `\n${pinyin.k}`
      //     continue
      //   }
      // }

      // or does the pinyin already exist ?
      const pinyinIndex = pinyinsArray.findIndex(
        p => (!p.characters && p.t === pinyin.t) || (p.characters && p.characters.length === pinyin.characters.length && (!pinyin.t || p.t === pinyin.t) && p.characters.every(c => pinyin.characters.includes(c)))
      )

      if (pinyinIndex >= 0) {
        const existing = pinyinsArray[pinyinIndex]
        if (pinyin.k) {
          existing.k += `\n${pinyin.k}`
        }
      } else {
        pinyinsArray.push(pinyin)
      }
      // const pinyinIndex = wordObject.p.findIndex(p => (!p.character && p.t === pinyin.t) || (p.character && p.character === pinyin.character && p.t === pinyin.t))
      // if (pinyinIndex >= 0 || (previousPinyin && !previousPinyin.t)) {
      //   const existing = wordObject.p[pinyinIndex] || previousPinyin
      //   if (pinyin.k) {
      //     existing.k += `\n${pinyin.k}`
      //   }
      //   if (!existing.t) {
      //     existing.t = pinyin.t
      //   }
      // } else {

      // }
      previousPinyin = pinyin
      // return
    }
    // console.log(pinyinsArray)

    /* create the map out of the array */
    if (wordType === 'simplified') {
      pinyinsMap = {}
      let objectToStuffDataIn
      for (const pinyin of pinyinsArray) {
        let characters = pinyin.characters
        if (!pinyin.characters || (pinyin.characters.length === 1 && pinyin.characters[0] === word)) {
          objectToStuffDataIn = wordObject
        } else {
          let traditionals = characters
          if (traditionals.includes(word)) {
            traditionals.splice(traditionals.indexOf(word), 1)
          }
          // take the first character which represents the traditional one
          // the others characters represent the variants
          const traditional = traditionals[0]
          if (!pinyinsMap[traditional]) {
            pinyinsMap[traditional] = {}
          }
          objectToStuffDataIn = pinyinsMap[traditional]
        }

        delete pinyin.characters
        if (!objectToStuffDataIn.p) {
          objectToStuffDataIn.p = []
        }
        objectToStuffDataIn.p.push(pinyin)
      }

      // if traditionals characters are present, we make the reference array in the simplified object
      if (Object.keys(pinyinsMap).length > 0) {
        wordObject.ts = Object.keys(pinyinsMap)

        // if (wordObject.ts.length === 1) {
        //   wordObject.t = wordObject.ts[0]
        //   for (const pinyin of pinyinsMap[wordObject.ts[0]].p) {
        //     const pinyinIndex = wordObject.p.findIndex(p => p.t === pinyin.text)
        //     if (pinyinIndex >= 0 && pinyin.k && pinyin.k.length > 0) {
        //       wordObject.p[pinyinIndex].k += `\n${pinyin.k}`
        //     } else {
        //       wordObject.p.push({
        //         t: pinyin.t,
        //         k: pinyin.k
        //       })
        //     }
        //   }
        // }
      }

      if (variants.length > 0) {
        // const variants = wordObject.v.filter(v => !Object.keys(pinyinsMap).includes(v))
        if (Object.values(pinyinsMap).length > 1) {
          for (const trad of Object.values(pinyinsMap)) {
            trad.v = variants
          }
        } else {
          wordObject.v = variants
        }
      }
    } else if (wordType === 'traditional') {
      if (!wordObject.p) {
        wordObject.p = []
      }
      if (word.length === 1) {
        for (const pinyin of pinyinsArray) {
          if (pinyin.characters.length === 1 && pinyin.characters[0] === word) {
            delete pinyin.characters
            wordObject.p.push(pinyin)
          }
        }
      } else {
        wordObject.p = pinyinsArray
      }

      // variants (we remove the simplified character)
      const simplifiedIndex = variants.indexOf(wordObject.s)
      if (simplifiedIndex >= 0) {
        variants.splice(simplifiedIndex, 1)
      }
      if (variants.length > 0) {
        wordObject.v = variants
      }
    }
  })()
  /**
   * #references
   */
  if (wordType === 'simplified') {
    for (const trad in pinyinsMap) {
      for (const pinyin of pinyinsMap[trad].p) {
        if (pinyin.k) {
          const reference = getPinyinReference(pinyin)
          if (reference) {
            const stuffData = characterObject => {
              if (!characterObject.p) {
                characterObject.p = []
              }
              const pinyinIndex = characterObject.p.findIndex(p => p.t === pinyin.t)
              const sourcePinyinIndex = pinyinsMap[trad].p.findIndex(p => p.t === pinyin.t)
              if (sourcePinyinIndex < 0) {
                return // ignore (the target was not find)
              }
              if (pinyinIndex >= 0) {
                characterObject.p[pinyinIndex].k += `\n${pinyinsMap[trad].p[sourcePinyinIndex].k}`
              } else {
                characterObject.p.push({ t: pinyin.t, k: pinyinsMap[trad].p[sourcePinyinIndex].k })
              }
              pinyinsMap[trad].p.splice(sourcePinyinIndex, 1)
            }

            if (reference === word) {
              stuffData(wordObject)
            }
            if (pinyinsMap[reference]) {
              stuffData(pinyinsMap[reference])
            }
          }
        }
      }
    }
  }
  /**
   * #existandreplace
   ************************/
  if (pinyinsMap) {
    for (const trad in pinyinsMap) {
      const existing = get(trad)
      if (existing) {
        console.log('exist and replace')
        pinyinsMap[trad] = existing
        // if there are some references to the simplified object
        // we should get rid of them for flushing the data
        for (const pinyin of pinyinsMap[trad].p) {
          if (pinyin.k) {
            for (const part of pinyin.k.split('\n')) {
              const reference = getPinyinReference(part)
              if (reference && reference === word) {
                pinyin.k = part
                if (pinyin.a) {
                  delete pinyin.a
                }
                pinyin
              }
            }
          }
        }
      }
    }
  }
  // if (wordType === 'simplified') {
  //   ctx.body = {
  //     wordObject,
  //     pinyinsMap
  //   }
  // } else if (wordType === 'traditional') {
  //   ctx.body = wordObject
  // }
  // return

  /**
   * #baidu
   **************/
  let baiduWordToSearch
  if (word.length === 1 && wordObject.t) {
    baiduWordToSearch = wordObject.t
  }
  // if (!baiduWordToSearch && word.length === 1 && wordObject.p && wordObject.p.length > 0) {
  //   const traditionals = [...new Set(wordObject.p.filter(p => p.character).map(p => p.character))]
  //   if (traditionals.length > 0) {
  //     baiduWordToSearch = traditionals[0]
  //   }
  // }

  if (!baiduWordToSearch && wordObject.s) {
    baiduWordToSearch = wordObject.s
  }
  if (!baiduWordToSearch) {
    baiduWordToSearch = word
  }

  let baiduResult
  baiduResult = await fetchChineseInformationsFromBaidu(baiduWordToSearch)
  if (baiduResult) {
    if (baiduResult.e) {
      english = baiduResult.e
    }
    if (wordType === 'undefined') {
      wordType = 'simplified'
      wordObject.s = word
    }

    if (baiduResult.p && (wordObject.p || word.length > 1)) {
      if (word.length > 1 && !wordObject.p) {
        wordObject.p = []
      }
      /* we append the audio to existing entries */
      for (const pinyin of baiduResult.p) {
        const pinyinIndex = wordObject.p.findIndex(p => p.t.replace(/\s/g, '') === pinyin.t.replace(/\s/g, ''))
        if (pinyinIndex >= 0) {
          wordObject.p[pinyinIndex].t = pinyin.t
          if (pinyin.a) {
            wordObject.p[pinyinIndex].a = pinyin.a
          }
        } else if (word.length > 1) {
          // we assume there is always an audio ?
          wordObject.p.push({ t: pinyin.t, a: pinyin.a })
        }

        // we try to append the audio in the pinyinsMap (traditional entries) as well
        // if (pinyin.a && pinyinsMap) {
        //   for (const trad in pinyinsMap) {
        //     for (const tradPinyin of pinyinsMap[trad].p) {
        //       if (getPinyinReference(tradPinyin)) {
        //         // we ignore reference pinyins
        //         continue
        //       }
        //       if (tradPinyin.t === pinyin.t.replace(/\s/g, '')) {
        //         tradPinyin.a = pinyin.a
        //       }
        //     }
        //   }
        // }
      }
    }
  }
  // ctx.body = baiduResult
  // return
  //   .then(result => {
  //   if (result) {
  //     // if (wordType === 'unknown') {
  //     //   wordType === 'simplified'
  //     //   wordObject.s = word
  //     // }
  //     if (wordType === 'traditional' && !wordObject.t) {
  //       wordObject.t = wordObject.s
  //       delete wordObject.s
  //     }
  //     if (!wordObject.s && !wordObject.t) {
  //       wordType = 'simplified'
  //       wordObject.s = word
  //     }
  //     if (result.e) {
  //       // english
  //       // prefer the english from baidu website
  //       wordObject.e = result.e
  //     }

  //     // the audio
  //     if (result.p) {
  //       if (!wordObject.p) {
  //         wordObject.p = []
  //       }
  //       for (const pinyin of result.p) {
  //         let index = wordObject.p.findIndex(p => p.t === pinyin.t.replace(/\s/g, ''))
  //         if (index >= 0 || (wordObject.p[0] && !wordObject.p[0].t)) {
  //           if (index < 0) {
  //             index = 0
  //           }
  //           wordObject.p[index].t = pinyin.t
  //           wordObject.p[index].a = pinyin.a
  //         } else {
  //           wordObject.p.push(pinyin)
  //         }
  //       }
  //     }
  //   } else {
  //     // if (word.length > 1 && wordType === 'traditional') {
  //     //   wordObject.t = wordObject.s
  //     //   delete wordObject.s
  //     // }
  //   }
  // })
  // ctx.body = wordObject
  // return

  /* #english */
  if (english) {
    wordObject.e = english
  }

  /**
   * #completetraditionals
   * If some audio are missing or english in the pinyinsMap,
   * we try to fetch them
   **/
  if (pinyinsMap) {
    for (const tradChar in pinyinsMap) {
      if (!pinyinsMap[tradChar].e || pinyinsMap[tradChar].p.some(p => !getPinyinReference(p) && !p.a)) {
        const baiduAdditionalInformations = await fetchChineseInformationsFromBaidu(tradChar)
        if (baiduAdditionalInformations.e && baiduAdditionalInformations.e !== wordObject.e) {
          pinyinsMap[tradChar].e = baiduAdditionalInformations.e
        }
        if (baiduAdditionalInformations.p) {
          for (const pinyin of baiduAdditionalInformations.p) {
            if (pinyin.a) {
              for (const tradPinyin of pinyinsMap[tradChar].p) {
                if (getPinyinReference(tradPinyin)) {
                  // we ignore reference pinyins
                  continue
                }
                if (tradPinyin.t.replace(/\s/g, '') === pinyin.t.replace(/\s/g, '')) {
                  tradPinyin.a = pinyin.a
                }
              }
            }
          }
        }
      }
    }
  }
  // if (wordType === 'simplified') {
  //   ctx.body = {
  //     wordObject,
  //     pinyinsMap
  //   }
  // } else if (wordType === 'traditional') {
  //   ctx.body = wordObject
  // }
  // return

  /**
   * #saving
   **/
  if (wordType === 'traditional') {
    words[wordObject.t] = wordObject
    ctx.body = wordObject
    saveWords()
  } else if (wordType === 'simplified') {
    words[wordObject.s] = wordObject
    if (pinyinsMap) {
      for (const trad in pinyinsMap) {
        words[trad] = {
          t: trad,
          s: wordObject.s,
          ...pinyinsMap[trad]
        }
      }
    }
    saveWords()
    ctx.body = get(wordObject.s)
  } else {
    words[word] = 0
    saveWords()
    ctx.body = {}
  }
})

if (true) {
  router.get('/chinesed/:word', async ctx => {
    const word = decodeURIComponent(ctx.params.word)
    loadWords()
    if (word in words) {
      ctx.body = words[word]
      return
    }
    // else we fetch it
    const response = await fetch(`https://dict.naver.com/search.nhn?dicQuery=${encodeURIComponent(word)}`)
    if (!response) {
      return
    }
    const document = new JSDOM(await response.text()).window.document
    const dtEntries = [...document.querySelectorAll('.dic_cn_entry_cnEntry')]
    const index = dtEntries.findIndex(dt => dt.firstElementChild.textContent.trim() === word)
    if (index >= 0) {
      const definition = dtEntries[index].nextElementSibling.textContent.replace(/\s{2,}/g, ' ').trim()
      words[word] = definition
      // saveWords()
      ctx.body = definition
    } else {
      return // 404 not found
    }
  })
}

/**
 * Fetch informations about a korean word.
 */
router.get('/korean/:word', async ctx => {
  const word = decodeURIComponent(ctx.params.word)

  loadWords()
  if (word in words) {
    ctx.body = words[word]
    return
  }

  // else we fetch it
  const response = await fetch(`https://dict.naver.com/search.nhn?dicQuery=${encodeURIComponent(word)}`)
  if (!response) {
    return
  }

  const wordObject = {}
  const document = new JSDOM(await response.text()).window.document

  /**
   * definition
   */
  const koreanDefinitionLiwordCandidates = [...document.querySelectorAll('.lst_krdic li')]
  const koreanDefinitionIndex = koreanDefinitionLiwordCandidates.findIndex(element => element.firstElementChild.firstElementChild.textContent.trim().split(/\s+/)[0] === word)

  // we find a korean definition that matches the requested word
  if (koreanDefinitionIndex >= 0) {
    wordObject.definition = getPreContent(koreanDefinitionLiwordCandidates[koreanDefinitionIndex].lastElementChild)
  }

  /**
   * audioUrl
   */
  if (koreanDefinitionIndex >= 0) {
    try {
      const audioUrl = koreanDefinitionLiwordCandidates[koreanDefinitionIndex].querySelector('.play').getAttribute('playlist')
      wordObject.a = audioUrl
    } catch (e) {
      /* do nothing */
    }
  }

  /**
   * English translation
   */
  const englishTranslationDtwordCandidates = [...document.querySelectorAll('.en_dic_section > .dic_search_result > dt')]
  const englishTranslationIndex = englishTranslationDtwordCandidates.findIndex(element => {
    const words = element.firstElementChild.textContent.trim().split(/\s+/).map(w => w.trim())
    return words.includes(word) || words.includes(`(${word})`)
  })

  if (englishTranslationIndex >= 0) {
    wordObject.e = getPreContent(englishTranslationDtwordCandidates[englishTranslationIndex].nextElementSibling)
  }

  if (wordObject.definition) {
    words[word] = wordObject
    saveWords()
  } else {
    console.log(wordObject)
  }

  ctx.body = wordObject
})

app.use(router.routes())

const port = 51022
app.listen(port)
console.log(`KOREAN SERVER (http://localhost:${port}/)`)

/**
 * Util functions
 */
// get pre formatted text content of an element (html)
const getPreContent = element => {
  const replaceUndesired = str => str.replace(/\n/g, '').replace(/\s{2,}/g, ' ')

  let formatted = []
  for (const node of element.childNodes) {
    if (node.nodeType === 3) {
      // text node
      formatted.push(replaceUndesired(node.textContent))
    } else if (node.nodeName === 'BR') {
      formatted.push('\n')
    } else {
      formatted.push(replaceUndesired(node.textContent))
    }
  }

  return formatted.filter(text => text.length).join('').replace(/\s+\n\s+/g, '\n').trim()
}

// clean pinyin (usually from the received information from naver)
const cleanPinyin = pinyin => pinyin.replace(/‧|\/\//g, '').toLowerCase()

// strip html tags
const stripHtmlTags = str => {
  const div = new JSDOM().window.document.createElement('div')
  div.innerHTML = str
  return div.textContent || div.innerText || ''
}
