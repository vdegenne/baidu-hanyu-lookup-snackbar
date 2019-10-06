const Koa = require('koa')
const koaRouter = require('koa-router')
const cors = require('@koa/cors')
const fetch = require('node-fetch')
const { JSDOM } = require('jsdom')
const fs = require('fs')
// const { isChinese, isKorean } = require('asian-regexps/legacy')

/**
 * constants & co
 */
let koreanWordsFile = './korean-words.json'
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
      words = JSON.parse(fs.readFileSync(koreanWordsFile))
    } catch (e) {
      /* the file was not find */
      fs.writeFileSync('./korean-words.json')
      words = {}
    }
    // timeout
    wordsTimeout = setTimeout(() => {
      words = undefined
    }, 1000 * 60 * 10) // 10 minutes
  }
}
const saveWords = () => {
  fs.writeFileSync(koreanWordsFile, JSON.stringify(words))
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
  console.log(`fetching ${url}`)
  const response = await fetch(url)

  const document = new JSDOM(await response.text()).window.document
  const spans = [...document.querySelectorAll('[id=pinyin] span')]
  const englishDt = document.querySelector('[id=fanyi-wrapper] .tab-content dt')

  if (spans.length === 0 && !englishDt) {
    return null
  }

  return {
    pinyins: spans.map(element => {
      // text
      let text = element.firstElementChild.textContent
      if (text.trim().startsWith('[')) {
        text = text.trim().slice(1, -1).trim()
      }

      // audio
      let audio = element.lastElementChild.getAttribute('url')

      return { text, audio }
    }),
    english: englishDt ? englishDt.textContent : undefined
  }
}

/**
 * Fetch a korean definition from a chinese word.
 */
router.get('/chinese/:word', async ctx => {
  const word = decodeURIComponent(ctx.params.word).replace(/\s/g, '')

  loadWords()
  if (word in words) {
    ctx.body = words[word]
    return
  }

  const url = `https://zh.dict.naver.com/api3/zhko/search?query=${encodeURIComponent(word)}`
  console.log(`fetching ${url}`)
  const response = await fetch(url)

  let wordObject = {}
  let wordType = 'unknown'

  // fetch we determine if the word is simplified or traditional or unknown from naver informations
  let wordItems, wordCandidates, zhCandidates
  let result = await response.json()
  if (result) {
    wordItems = result.searchResultMap.searchResultListMap.WORD.items
    meaningItems = result.searchResultMap.searchResultListMap.MEANING.items

    if (wordItems.length > 0) {
      wordCandidates = wordItems.filter(i => {
        if (i.matchType === 'exact:entry') {
          return true
        }
        return false
      })
      zhCandidates = wordCandidates.filter(i => i.languageCode === 'ZHKO')

      wordType = zhCandidates.length !== 0 ? (zhCandidates.some(i => i.handleEntry === word) ? 'simplified' : 'traditional') : 'unknown'
    }
  }

  if (wordType === 'traditional') {
    wordObject.traditional = word
    // try to get the simplified form
    wordObject.simplified = zhCandidates.filter(i => i.handleEntry)[0].handleEntry
  }
  if (wordType === 'simplified') {
    // trying to find the traditional form from  both naver and hanyu.baidu is difficult
    // implement this if really needed
    const traditionals = zhCandidates.filter(i => i.searchTraditionalChineseList.length > 0)
    if (traditionals.length > 0) {
      wordObject.traditional = traditionals[0].searchTraditionalChineseList[0].traditionalChinese
    }
    wordObject.simplified = word
  }

  // we start fetching informations from baidu as a promise
  let baiduFetchPromise = fetchChineseInformationsFromBaidu(wordType !== 'unknown' ? wordObject.simplified : word).then(result => {
    if (result) {
      if (wordType === 'unknown') {
        wordType === 'simplified'
        wordObject.simplified = word
      }

      // english
      if (result.english) {
        // prefer the english from baidu website
        wordObject.english = result.english
      }

      // the audio
      if (result.pinyins) {
        if (!wordObject.pinyins) {
          wordObject.pinyins = []
        }
        for (const pinyin of result.pinyins) {
          const index = wordObject.pinyins.findIndex(p => p.text === pinyin.text.replace(/\s/g, ''))
          if (index >= 0) {
            wordObject.pinyins[index].text = pinyin.text
            wordObject.pinyins[index].audio.push(pinyin.audio)
          } else {
            wordObject.pinyins.push(pinyin)
          }
        }
      }
    }
  })

  /* Continue to process naver information */
  if (result && wordItems.length > 0) {
    // we should filter zhCandidates furthermore
    // because some handleEntry are not matching the exact request
    zhCandidates = zhCandidates.filter(i => i.handleEntry === (wordObject.simplified || word))

    // english
    let english = wordCandidates.filter(i => i.languageCode === 'ZHEN')[0]
    if (english) {
      wordObject.english = english.meansCollector[0].means.map(m => stripHtmlTags(m.value))
    }

    // pinyins audio
    for (const obj of zhCandidates.filter(i => i.searchPhoneticSymbolList.length > 0).map(i => i.searchPhoneticSymbolList[0])) {
      if (!wordObject.pinyins) {
        wordObject.pinyins = []
      }
      const text = cleanPinyin(obj.phoneticSymbol)
      if (wordObject.pinyins.some(p => p.text === text)) {
        continue
      }
      wordObject.pinyins.push({
        text,
        //audio: [obj.phoneticSymbolPath.substring(0, obj.phoneticSymbolPath.indexOf('.mp3') + 4)]
        audio: [obj.phoneticSymbolPath.split('|')[0]]
      })
    }

    // korean definition
    if (zhCandidates.length > 0) {
      let koreanDefinition = ''
      for (const item of zhCandidates.filter(i => i.meansCollector.length > 0)) {
        if (item.searchPhoneticSymbolList.length > 0) {
          koreanDefinition += `<b>[${cleanPinyin(item.searchPhoneticSymbolList[0].phoneticSymbol)}]</b>\n`
        }
        for (const collector of item.meansCollector) {
          let meanIndex = 1
          for (const mean of collector.means) {
            if (collector.means.length > 1) {
              koreanDefinition += `${meanIndex++}. `
            }
            if (collector.partOfSpeech) {
              koreanDefinition += `[${collector.partOfSpeech}] `
            }
            if (mean.subjectGroup) {
              koreanDefinition += `(${mean.subjectGroup}) `
            }
            koreanDefinition += `${stripHtmlTags(mean.value)}\n`
          }
        }
      }
      if (koreanDefinition.length > 0) {
        wordObject.kor = koreanDefinition
      }
    }
  }

  /* wait the promises */
  /* await fetchTraditionalPromise (to implement if needed !) */
  await baiduFetchPromise

  /* save the word */
  if (wordObject.traditional) {
    words[wordObject.traditional] = wordObject
    saveWords()
  } else if (wordObject.simplified) {
    words[wordObject.simplified] = wordObject
    saveWords()
  }

  ctx.body = wordObject
})

if (false) {
  // router.get('/chinese/:word', async ctx => {
  //   const word = decodeURIComponent(ctx.params.word)
  //   loadWords()
  //   if (word in words) {
  //     ctx.body = words[word]
  //     return
  //   }
  //   // else we fetch it
  //   const response = await fetch(`https://dict.naver.com/search.nhn?dicQuery=${encodeURIComponent(word)}`)
  //   if (!response) {
  //     return
  //   }
  //   const document = new JSDOM(await response.text()).window.document
  //   const dtEntries = [...document.querySelectorAll('.dic_cn_entry_cnEntry')]
  //   const index = dtEntries.findIndex(dt => dt.firstElementChild.textContent.trim() === word)
  //   if (index >= 0) {
  //     const definition = dtEntries[index].nextElementSibling.textContent.replace(/\s{2,}/g, ' ').trim()
  //     words[word] = definition
  //     // saveWords()
  //     ctx.body = definition
  //   } else {
  //     return // 404 not found
  //   }
  // })
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
      wordObject.audio = audioUrl
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
    wordObject.english = getPreContent(englishTranslationDtwordCandidates[englishTranslationIndex].nextElementSibling)
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
