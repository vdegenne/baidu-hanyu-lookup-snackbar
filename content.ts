import '@webcomponents/custom-elements'
import '@material/mwc-snackbar'
import '@material/mwc-icon-button'
import '@material/mwc-button'
import { html, TemplateResult, render } from 'lit-html'
import { Button } from '@material/mwc-button'

interface Pinyin {
  text: string
  audio: HTMLAudioElement
}
interface Word {
  text: string
  pinyins: Pinyin[]
}

declare let chrome: any

/* add the styles to the document */
$(`
  <link href="https://fonts.googleapis.com/css?family=Roboto:300,400,500" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css?family=Material+Icons&display=block" rel="stylesheet">
  <style>
    html {
      --mdc-snackbar-action-color: #3385ff;
    }
    mwc-snackbar {
      font-size: 16px !important;
    }
    mwc-icon-button:not(:last-of-type) {
      color: #3385ff
    }
  </style>`).appendTo('head')

/* script variables */
let word: string
let selectionChangeDebouncer: NodeJS.Timeout | undefined
let words: { [text: string]: Word } = {}

const formUrl = (word: string) => {
  // return `http://localhost:5000/words/${encodeURIComponent(word)}`
  return `https://hanyu.baidu.com/s?wd=${encodeURIComponent(word)}&ptype=zici`
}

const formNaverUrl = (word: string) => {
  return `https://zh.dict.naver.com/#/search?range=example&query=${encodeURIComponent(word)}`
}

/**
 * Snackbars
 */
const wordSnackbar = document.createElement('mwc-snackbar')
let snackbarclosed: boolean = true
// @ts-ignore
wordSnackbar.addEventListener('MDCSnackbar:closing', (e: CustomEvent) => {
  if (e.detail && e.detail.reason === 'clicked') {
    snackbarclosed = true
  }
  if (!snackbarclosed) {
    wordSnackbar.open()
  }
})
const openWordSnackbar = async (text: string, template: TemplateResult) => {
  render(template, wordSnackbar)
  snackbarclosed = false
  wordSnackbar.labelText = text
  await wordSnackbar.updateComplete
  // @ts-ignore
  ;[...wordSnackbar.querySelectorAll('mwc-button')].forEach((element: Button) => {
    // @ts-ignore
    element.shadowRoot.getElementById('button').style = 'font-size:inherit;line-height:inherit'
  })
  wordSnackbar.open()
  infoSnackbar.close()
}
document.body.appendChild(wordSnackbar)
// fix size
wordSnackbar.updateComplete.then(async () => {
  let label: HTMLElement
  // @ts-ignore
  while (!(label = wordSnackbar.shadowRoot.querySelector('[class=mdc-snackbar__label]'))) {
    await new Promise(resolve => setTimeout(resolve, 80))
  }
  // @ts-ignore
  label.style = 'font-size:inherit;line-height:inherit'
})

const infoSnackbar = document.createElement('mwc-snackbar')
const openInfoSnackbar = (text: string) => {
  infoSnackbar.labelText = text
  infoSnackbar.open()
}
document.body.appendChild(infoSnackbar)
// fix size
infoSnackbar.updateComplete.then(async () => {
  let label: HTMLElement
  // @ts-ignore
  while (!(label = infoSnackbar.shadowRoot.querySelector('[class=mdc-snackbar__label]'))) {
    await new Promise(resolve => setTimeout(resolve, 80))
  }
  // @ts-ignore
  label.style = 'font-size:inherit;line-height:inherit'
})

const updateSnackBarFromWord = (word: Word) => {
  // play first pinyin as the snack open
  if (word.pinyins.length) {
    word.pinyins[0].audio.play()
  }
  openWordSnackbar(
    `${word.text}${!word.pinyins.length ? ' (no information)' : ''}`,
    html`
      ${word.pinyins.map((pinyin: Pinyin) => {
        // if no audio, we just display the pinyin
        if (!pinyin.audio) {
          return `${pinyin.text}`
        }

        return html`
        <mwc-button unelevated style="margin:0 2px;" slot="action" @click="${(e: Event) => {
          e.stopPropagation()
          pinyin.audio.play()
        }}">${pinyin.text}</mwc-button>
        `
      })}

      <mwc-icon-button slot="action" @click="${(e: Event) => {
        e.stopPropagation()
        window.open(formNaverUrl(word.text), '_blank')
      }}">
        <img slot="icon" src="${chrome.runtime.getURL('./images/naver.png')}" width="24px">
      </mwc-icon-button>

      
      <mwc-icon-button icon="search" slot="action" @click="${(e: Event) => {
        e.stopPropagation()
        window.open(formUrl(word.text), '_blank')
      }}"></mwc-icon-button>
      

      <mwc-icon-button icon="close" slot="dismiss" @click="${(e: Event) => {
        e.stopPropagation()
        wordSnackbar.close('clicked')
      }}"></mwc-icon-button>
  `
  )
}

const fetchInformations = async (text: string) => {
  // visual feedback
  wordSnackbar.close('clicked')
  openInfoSnackbar('fetching...')

  // if the word already exists
  if (words[text]) {
    updateSnackBarFromWord(words[text])
    return
  }

  // else we fetch it from the background
  const word: Word = <Word>await new Promise(resolve =>
    chrome.runtime.sendMessage({ message: 'fetch_word', word: text }, resolve)
  )

  if (word && word.pinyins) {
    word.pinyins.forEach(pinyin => {
      // @ts-ignore
      pinyin.audio = new Audio(pinyin.audio)
    })
    words[word.text] = word
    updateSnackBarFromWord(word)
  } else {
    openInfoSnackbar('no entry')
  }
}

let mousePressed = false
document.addEventListener('mousedown', () => (mousePressed = true))
document.addEventListener('mouseup', () => {
  checkSelection()
  mousePressed = false
})

if (false) {
  document.addEventListener('selectionchange', () => {
    // grab the new selection
    const selection = window.getSelection()
    if (selection) {
      if (selectionChangeDebouncer !== undefined) {
        clearTimeout(selectionChangeDebouncer)
        selectionChangeDebouncer = undefined
      }
      selectionChangeDebouncer = setTimeout(() => {
        word = selection.toString()
        if (word.length === 0) return
        if (word.includes(' ') || word.length > 5) {
          openInfoSnackbar('select a word, not a sentence')
          return
        }
        fetchInformations(word)
      }, 500)
    }
  })
}

let previousWord: string
const checkSelection = () => {
  const selection = window.getSelection()
  if (selection) {
    let word = selection.toString()
    word = word.replace(/\s/g, '')
    if (word.length === 0) {
      previousWord = ''
      wordSnackbar.close('clicked')
      return
    }
    if (word.length > 5) {
      openInfoSnackbar('select a word, not a sentence')
      return
    }
    if (previousWord && previousWord === word) {
      return
    }
    fetchInformations(word)
    previousWord = word
  }
}

chrome.runtime.onMessage.addListener((request: any) => {
  if (request.message === 'word_received') {
    console.log(request.response)
    //var firstHref = $("a[href^='http']").eq(0).attr('href')

    //console.log(firstHref)
  }
})
