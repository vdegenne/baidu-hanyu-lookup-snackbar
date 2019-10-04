const Koa = require('koa')
const koaRouter = require('koa-router')
const cors = require('@koa/cors')
const fetch = require('node-fetch')
const { JSDOM } = require('jsdom')
const fs = require('fs')

/**
 * Util
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
 * Fetch a korean definition from a chinese word.
 */
router.get('/chinese/:word', async ctx => {
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
  const koreanDefinitionLiCandidates = [...document.querySelectorAll('.lst_krdic li')]
  const koreanDefinitionIndex = koreanDefinitionLiCandidates.findIndex(element => element.firstElementChild.firstElementChild.textContent.trim().split(/\s+/)[0] === word)

  // we find a korean definition that matches the requested word
  if (koreanDefinitionIndex >= 0) {
    wordObject.definition = getPreContent(koreanDefinitionLiCandidates[koreanDefinitionIndex].lastElementChild)
  }

  /**
   * audioUrl
   */
  if (koreanDefinitionIndex >= 0) {
    try {
      const audioUrl = koreanDefinitionLiCandidates[koreanDefinitionIndex].querySelector('.play').getAttribute('playlist')
      wordObject.audio = audioUrl
    } catch (e) {
      /* do nothing */
    }
  }

  /**
   * English translation
   */
  const englishTranslationDtCandidates = [...document.querySelectorAll('.en_dic_section > .dic_search_result > dt')]
  const englishTranslationIndex = englishTranslationDtCandidates.findIndex(element => {
    const words = element.firstElementChild.textContent.trim().split(/\s+/).map(w => w.trim())
    return words.includes(word) || words.includes(`(${word})`)
  })

  if (englishTranslationIndex >= 0) {
    wordObject.english = getPreContent(englishTranslationDtCandidates[englishTranslationIndex].nextElementSibling)
  }

  // console.log(`======= word (${word}) ========`)
  // console.log(wordObject)

  if (wordObject.definition) {
    words[word] = wordObject
    saveWords()
  } else {
    console.log(wordObject)
  }

  ctx.body = wordObject
})

app.use(router.routes())

app.listen(5000)
console.log(`KOREAN SERVER (http://localhost:5000/)`)

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
