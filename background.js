const parser = new DOMParser()

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.message === 'fetch_chinese_word') {
    fetch(`http://localhost:51022/chinese/${request.word}`)
      .then(async response => {
        if (response.status !== 200) {
          sendResponse(null)
          return
        }

        sendResponse(await response.json())
      })
      .catch(e => sendResponse(-1))
  } else if (request.message === 'fetch_korean_definition_from_chinese') {
    fetch(`http://localhost:51022/chinese/${request.word}`)
      .then(async response => {
        if (response.status !== 200) {
          sendResponse(null)
          return
        }

        sendResponse(await response.text())
      })
      .catch(e => sendResponse(-1))
  } else if (request.message === 'fetch_korean_word') {
    fetch(`http://localhost:51022/korean/${request.word}`)
      .then(async response => {
        if (response.status !== 200) {
          sendResponse(null)
          return
        }
        sendResponse(await response.json())
      })
      .catch(e => sendResponse(-1))
  }
  return true
})
