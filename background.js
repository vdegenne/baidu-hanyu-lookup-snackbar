const formUrl = word => {
  return `https://hanyu.baidu.com/s?wd=${encodeURIComponent(word)}&ptype=zici`
}
const parser = new DOMParser()

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.message === 'fetch_word') {
    fetch(formUrl(request.word)).then(async response => {
      if (response.status !== 200) {
        sendResponse(null)
        return
      }

      const content = await response.text()
      const document = parser.parseFromString(content, 'text/html')
      const spans = [...document.querySelectorAll('[id=pinyin] span')]
      // if (!spans.length) {
      //   sendResponse(null)
      // }

      sendResponse({
        text: request.word,
        pinyins: spans.map(element => {
          // text
          let text = element.firstElementChild.textContent
          if (text.trim().startsWith('[')) {
            text = text.trim().slice(1, -1).trim()
          }

          // audio
          let audio = element.lastElementChild.getAttribute('url')

          return { text, audio }
        })
      })
    })
    return true
  }
})
