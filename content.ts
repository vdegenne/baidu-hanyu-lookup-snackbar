import '@webcomponents/custom-elements'
import '@material/mwc-snackbar'
import '@material/mwc-icon-button'
import '@material/mwc-button'
import '@material/mwc-dialog'
import { html, TemplateResult, render } from 'lit-html'
import { Button } from '@material/mwc-button'
import { Dialog } from '@material/mwc-dialog'

interface Pinyin {
  text: string
  audio: HTMLAudioElement
}
interface Word {
  text: string
  pinyins: Pinyin[]
  english: string | null
}

declare let chrome: any

/* add the styles to the document */
$(`
  <link href="https://fonts.googleapis.com/css?family=Roboto:300,400,500" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css?family=Material+Icons&display=block" rel="stylesheet">
  <style>
    mwc-snackbar {
      font-size: 16px !important;
    }
    mwc-dialog, mwc-icon-button:not(:last-of-type), html {
      --mdc-theme-primary: #2932e1;
      --mdc-snackbar-action-color: #2932e1;
    }
    mwc-icon {
      margin: 0 5px;
      padding:10px;
    }
    mwc-button[slot=action] > img {
      width: 24px;
      height: 24px;
    }
  </style>`).appendTo('head')

/* script variables */
let words: { [text: string]: Word } = {}

const formUrl = (word: string) => {
  // return `http://localhost:5000/words/${encodeURIComponent(word)}`
  return `https://hanyu.baidu.com/s?wd=${encodeURIComponent(word)}&ptype=zici`
}

/**
 * Snackbars
 */
const wordSnackbar = document.createElement('mwc-snackbar')
wordSnackbar.addEventListener('click', e => e.stopPropagation())
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
  /* fix the font to prevent pages to change this value */
  // @ts-ignore
  ;[...wordSnackbar.querySelectorAll('mwc-button')].forEach((element: Button) => {
    // @ts-ignore
    const button = element.shadowRoot.getElementById('button')
    // @ts-ignore
    button.style = `font-size:inherit;line-height:inherit;${element.slot === 'action' ? 'min-width:24px' : ''}`
  })
  // @ts-ignore
  wordSnackbar.shadowRoot.querySelector('.mdc-snackbar__actions').style.flex = '1'
  // @ts-ignore
  setTimeout(() => (wordSnackbar.shadowRoot.querySelector('.mdc-snackbar__label').style.flexGrow = '0'), 100)

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
infoSnackbar.addEventListener('click', e => e.stopPropagation())
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

/**
 * Dialog
 */
const dialog: Dialog = document.createElement('mwc-dialog')
dialog.addEventListener('click', (e: Event) => e.stopPropagation())
const openDialog = (template: TemplateResult, title?: string) => {
  // @ts-ignore
  dialog.title = html`<b>${title}</b>` || ''

  render(
    html`
    ${template}
    <mwc-button unelevated slot="primaryAction" dialogAction="close">close</mwc-button>
  `,
    dialog
  )
  dialog.open = true
}
document.body.appendChild(dialog)

const openNaverDialog = (template: TemplateResult, word: Word) => {
  openDialog(
    html`
  ${template}
  <mwc-button slot="secondaryAction" unelevated style="--mdc-theme-primary:#00d136" @click="${(e: Event) => {
    window.open(`https://zh.dict.naver.com/#/search?range=example&query=${encodeURIComponent(word.text)}`)
  }}">see examples in naver</mwc-button>
  `,
    word.text
  )
}

const koreanDefinitions: { [word: string]: string } = {}
const onNaverButtonClick = async (word: Word) => {
  if (!word || !word.pinyins.length) {
    window.open(`https://zh.dict.naver.com/#/search?range=all&query=${encodeURIComponent(word.text)}`, '_blank')
  } else {
    openNaverDialog(html`fetching...`, word)

    let definition: string | number
    if (koreanDefinitions[word.text]) {
      definition = koreanDefinitions[word.text]
    } else {
      // we should fetch the informations here
      definition = await new Promise(resolve => chrome.runtime.sendMessage({ message: 'fetch_korean_definition', word: word.text }, resolve))
    }

    if (definition === -1) {
      openNaverDialog(html`<span style="color:red">⚠️ Korean server not running.</span>`, word)
    } else {
      if (definition) {
        openNaverDialog(html`${definition}`, word)
        koreanDefinitions[word.text] = <string>definition
      } else {
        openNaverDialog(html`no definition.`, word)
      }
    }
  }
}

/**
 * Update the snackbar based on a given word
 */
const updateSnackBarFromWord = (word: Word) => {
  // play first pinyin as the snack open
  if (word.pinyins.length) {
    word.pinyins[0].audio.play()
  }
  openWordSnackbar(
    `${word.text}${!word.pinyins.length ? ' (no information)' : ''}`,
    html`
      <div slot="action" style="flex:1">
      ${word.pinyins.map((pinyin: Pinyin) => {
        // if no audio, we just display the pinyin
        if (!pinyin.audio) {
          return `${pinyin.text}`
        }

        return html`
        <mwc-button unelevated dense style="margin:0 2px" @click="${(e: Event) => {
          e.stopPropagation()
          pinyin.audio.play()
        }}">${pinyin.text}</mwc-button>
        `
      })}
      </div>

      <mwc-button slot="action" @click="${(e: Event) => {
        // e.stopPropagation()
        window.open(formUrl(word.text), '_blank')
      }}">
        <img src="${chrome.runtime.getURL('./images/baidu.png')}">
      </mwc-button>

      <mwc-button slot="action" @click="${(e: Event) => {
        // e.stopPropagation()
        onNaverButtonClick(word)
        // window.open(formNaverUrl(word.text), '_blank')
      }}">
        <img src="${chrome.runtime.getURL('./images/korean.png')}">
      </mwc-button>

      <mwc-button slot="action" @click="${(e: Event) => {
        // e.stopPropagation()
        openDialog(html`${word.english}`, word.text)
      }}">
        <img src="${chrome.runtime.getURL('./images/english.jpg')}">
      </mwc-button>

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
  const word: Word = <Word>await new Promise(resolve => chrome.runtime.sendMessage({ message: 'fetch_word', word: text }, resolve))

  if (word && word.pinyins) {
    word.pinyins.forEach(pinyin => {
      // @ts-ignore
      pinyin.audio = new Audio(pinyin.audio)
      pinyin.audio.volume = 0.3
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

let previousWord: string
const checkSelection = () => {
  const selection = window.getSelection()
  if (selection) {
    let word = selection.toString()
    word = word.replace(/\s/g, '')
    if (word.length === 0) {
      // previousWord = ''
      // wordSnackbar.close('clicked')
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
