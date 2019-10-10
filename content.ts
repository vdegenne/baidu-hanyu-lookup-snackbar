import '@webcomponents/custom-elements'
import '@material/mwc-snackbar'
import '@material/mwc-icon-button'
import '@material/mwc-button'
import '@material/mwc-dialog'
import { html, TemplateResult, render } from 'lit-html'
import { unsafeHTML } from 'lit-html/directives/unsafe-html'
import { Button } from '@material/mwc-button'
import { Dialog } from '@material/mwc-dialog'
import { isChinese, isKorean, koreanRegExp, chineseRegExp } from 'asian-regexps'

interface Pinyin {
  text: string
  audio: HTMLAudioElement[]
}
interface Word {
  getKey: Function
  traditional?: string
  simplified?: string
  definition?: string
  kor?: string
  audio?: HTMLAudioElement
  pinyins?: Pinyin[]
  english?: string
  lang?: string
}

declare let chrome: any

/* add the styles to the document */
$(`
  <style>
    @font-face {
      font-family: 'Roboto';
      font-style: normal;
      font-weight: 400;
      src: local('Roboto'), local('Roboto-Regular'), url(${chrome.runtime.getURL('fonts/KFOmCnqEu92Fr1Mu4mxK.woff2')}) format('woff2');
      unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
    }
    @font-face {
      font-family: 'Roboto';
      font-style: normal;
      font-weight: 500;
      src: local('Roboto Medium'), local('Roboto-Medium'), url(${chrome.runtime.getURL('fonts/KFOlCnqEu92Fr1MmEU9fBBc4.woff2')}) format('woff2');
      unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
    }
    @font-face {
      font-family: 'Roboto';
      font-style: normal;
      font-weight: 500;
      src: local('Roboto Medium'), local('Roboto-Medium'), url(${chrome.runtime.getURL('fonts/KFOlCnqEu92Fr1MmEU9fChc4EsA.woff2')}) format('woff2');
      unicode-range: U+0100-024F, U+0259, U+1E00-1EFF, U+2020, U+20A0-20AB, U+20AD-20CF, U+2113, U+2C60-2C7F, U+A720-A7FF;
    }
    @font-face {
      font-family: 'Roboto';
      font-style: normal;
      font-weight: 400;
      src: local('Roboto'), local('Roboto-Regular'), url(${chrome.runtime.getURL('fonts/KFOmCnqEu92Fr1Mu7GxKOzY.woff2')}) format('woff2');
      unicode-range: U+0100-024F, U+0259, U+1E00-1EFF, U+2020, U+20A0-20AB, U+20AD-20CF, U+2113, U+2C60-2C7F, U+A720-A7FF;
    }
    @font-face {
      font-family: 'Material Icons';
      font-style: normal;
      font-weight: 400;
      src: url(${chrome.runtime.getURL('fonts/MaterialIcons-Regular.eot')}); /* For IE6-8 */
      src: local('Material Icons'),
      local('MaterialIcons-Regular'),
      url(${chrome.runtime.getURL('fonts/MaterialIcons-Regular.woff2')}) format('woff2'),
      url(${chrome.runtime.getURL('fonts/MaterialIcons-Regular.woff')}) format('woff'),
      url(${chrome.runtime.getURL('fonts/MaterialIcons-Regular.ttf')}) format('truetype');
    }
    mwc-snackbar {
      font-size: 16px !important;
    }
    mwc-dialog, mwc-icon-button:not(:last-of-type), html {
      --mdc-theme-primary: #2932e1;
      --mdc-snackbar-action-color: #2932e1;
      /*--mdc-dialog-max-width:400px;*/
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
document.body.prepend(wordSnackbar)
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
document.body.prepend(infoSnackbar)
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
    ${word.lang === 'chinese'
      ? html`
      <mwc-button slot="secondaryAction" unelevated style="--mdc-theme-primary:#00d136" @click="${(e: Event) => {
        window.open(`https://zh.dict.naver.com/#/search?range=example&query=${encodeURIComponent(word.getKey())}`, '_blank')
      }}"
      >see examples in naver</mwc-button>`
      : null}
      
    ${word.lang === 'korean'
      ? html`
      <mwc-button slot="secondaryAction" unelevated style="--mdc-theme-primary:#00d136" @click="${(e: Event) => {
        window.open(`https://dict.naver.com/search.nhn?dicQuery=${encodeURIComponent(word.getKey())}`, '_blank')
      }}"
      >see on naver</mwc-button>`
      : null}
    `,
    word.getKey()
  )
}

const onNaverButtonClick = async (word: Word) => {
  // chinese
  if (word.lang === 'chinese') {
    if (word.pinyins && !word.pinyins.length) {
      window.open(`https://zh.dict.naver.com/#/search?range=all&query=${encodeURIComponent(word.getKey())}`, '_blank')
    } else {
      openNaverDialog(html`fetching...`, word)
      if (word.kor) {
        // @ts-ignore
        openNaverDialog(
          html`
        <div style="padding:0 12px">
          ${unsafeHTML(word.kor.replace(/\n/g, '<br>'))}
        </div>
        `,
          word
        )
      } else {
        openNaverDialog(html`no definition`, word)
      }
      // let definition: string | number
      // if (koreanDefinitions[word.getKey()]) {
      //   definition = koreanDefinitions[word.]
      // } else {
      //   // we should fetch the informations here
      //   definition = await new Promise(resolve => chrome.runtime.sendMessage({ message: 'fetch_korean_definition_from_chinese', word: word.text }, resolve))
      // }

      // if (word.kor === -1) {
      //   openNaverDialog(html`<span style="color:red">⚠️ Korean server not running.</span>`, word)
      // } else {
      //   if (definition) {
      //     openNaverDialog(html`${definition}`, word)
      //     koreanDefinitions[word.text] = <string>definition
      //   } else {
      //     openNaverDialog(html`no definition.`, word)
      //   }
      // }
    }
  } else if (word.lang === 'korean') {
    if (word.definition) {
      openNaverDialog(
        html`
      <div style="padding:0 12px">${unsafeHTML(word.definition.replace(/\n/g, '<br>'))}</div>
      `,
        word
      )
    }
  }
}

/**
 * Update the snackbar based on a given word
 */
const updateSnackBarFromWord = (word: Word) => {
  let title: string = ''
  switch (word.lang) {
    case 'chinese':
      if (word.pinyins && word.pinyins.length && word.pinyins[0].audio && word.pinyins[0].audio.length) {
        word.pinyins[0].audio[0].play()
      }
      if (word.traditional) {
        title += `${word.traditional} (${word.simplified})`
      } else if (word.simplified) {
        title += word.simplified
      } else {
        title += word.getKey()
      }
      if (word.pinyins && !word.pinyins.length) {
        title += ' (no information)'
      }
      break
    case 'korean':
      if (word.audio) {
        word.audio.play()
      }
      title = `${word.getKey()}`
      break
  }

  openWordSnackbar(
    title,
    html`
      <div slot="action" style="flex:1">
      ${word.pinyins &&
        word.pinyins.map((pinyin: Pinyin) => {
          // if no audio, we just display the pinyin
          if (!pinyin.audio) {
            return `${pinyin.text}`
          }

          return html`
          <mwc-button unelevated dense style="margin:0 2px" @click="${(e: Event) => {
            // e.stopPropagation()
            pinyin.audio[0].play()
          }}">${pinyin.text}</mwc-button>
        `
        })}
      </div>

      ${word.lang === 'chinese'
        ? html`
      <mwc-button slot="action" @click="${(e: Event) => {
        // e.stopPropagation()
        window.open(formUrl(word.simplified || word.getKey()), '_blank')
      }}">
        <img src="${chrome.runtime.getURL('./images/baidu.png')}">
      </mwc-button>
      `
        : null}

      <mwc-button slot="action" @click="${(e: Event) => onNaverButtonClick(word)}">
        <img src="${chrome.runtime.getURL('./images/korean.png')}">
      </mwc-button>

      ${word.english
        ? html`
      <mwc-button slot="action" @click="${(e: Event) => {
        // e.stopPropagation()
        openDialog(html`${unsafeHTML((word.english as string).replace(/;/g, '<br>'))}`, word.getKey())
      }}">
        <img src="${chrome.runtime.getURL('./images/english.jpg')}">
      </mwc-button>
      `
        : null}

      <mwc-icon-button icon="close" slot="dismiss" @click="${(e: Event) => {
        e.stopPropagation()
        wordSnackbar.close('clicked')
      }}"></mwc-icon-button>
  `
  )
}

const fetchInformations = async (text: string) => {
  // determine the language of the selected word
  let lang: string | undefined = isChinese(text) ? 'chinese' : undefined
  if (!lang) {
    lang = isKorean(text) ? 'korean' : undefined
  }
  // japanese support ?
  // if (!lang) {
  //   lang = isJapanese(text) ? 'japanese' : undefined
  // }

  if (!lang) {
    return
  }

  // visual feedback
  wordSnackbar.close('clicked')
  openInfoSnackbar('fetching...')

  // if the word already exists
  if (words[text]) {
    updateSnackBarFromWord(words[text])
    return
  }

  let word: Word
  switch (lang) {
    case 'chinese':
      word = await new Promise(resolve => chrome.runtime.sendMessage({ message: 'fetch_chinese_word', word: text }, resolve))
      if (word.pinyins) {
        word.pinyins.forEach(pinyin => {
          console.log(pinyin.audio)
          if (pinyin.audio) {
            pinyin.audio = pinyin.audio.map((url: any) => {
              const audio = new Audio(url)
              audio.volume = 1
              return audio
            })
          }
        })
      }

      word = Object.assign(
        // @ts-ignore
        word !== -1 ? word : {},
        <Word>{
          lang: 'chinese',
          getKey: function(): string {
            if (this.traditional) {
              return this.traditional
            }
            if (this.simplified) {
              return this.simplified
            } else {
              return text
            }
          }
        }
      )
      break
    case 'korean':
      word = await new Promise(resolve => chrome.runtime.sendMessage({ message: 'fetch_korean_word', word: text }, resolve))
      if (word && word.audio) {
        // @ts-ignore
        word.audio = new Audio(word.audio)
      }

      word = Object.assign(
        // @ts-ignore
        word !== -1 ? word : {},
        <Word>{
          lang: 'korean',
          getKey: function(): string {
            return text
          }
        }
      )
  }

  // @ts-ignore
  if (word) {
    console.log(word)
    updateSnackBarFromWord(word)
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
    /* prepare the selection */
    let word = selection.toString()
    word = word.replace(/\s/g, '')
    /* restrictions */
    // minimum restriction
    if (word.length === 0 || (isKorean(word) && word.length < 2)) {
      // previousWord = word
      return
    }
    // maximum restriction
    if (word.length > 5) {
      return
    }
    // korean
    if (isKorean(word)) {
      if (word.length < 2) {
        return
      }
      const matches = word.match(new RegExp(koreanRegExp, 'g'))
      if (!(matches && matches.length === 1 && matches[0].length === word.length)) {
        return
      }
    }
    // chinese
    if (isChinese(word)) {
      const matches = word.match(new RegExp(chineseRegExp, 'g'))
      if (!(matches && matches.length === 1 && matches[0].length === word.length)) {
        return
      }
    }
    if (previousWord && previousWord === word) {
      return
    }
    fetchInformations(word)
    previousWord = word
  }
}
