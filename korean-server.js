const Koa = require('koa')
const koaRouter = require('koa-router')
const cors = require('@koa/cors')
const fetch = require('node-fetch')
const { JSDOM } = require('jsdom')

const app = new Koa()
app.use(cors())

const router = new koaRouter()

router.get('/korean/:word', async ctx => {
  const word = decodeURIComponent(ctx.params.word)
  const response = await fetch(`https://dict.naver.com/search.nhn?dicQuery=${encodeURIComponent(word)}`)
  if (!response) {
    return
  }

  const document = new JSDOM(await response.text()).window.document
  const dtEntries = [...document.querySelectorAll('.dic_cn_entry_cnEntry')]
  const index = dtEntries.findIndex(dt => dt.firstElementChild.textContent.trim() === word)
  if (index >= 0) {
    ctx.body = dtEntries[index].nextElementSibling.textContent.replace(/\s{2,}/g, ' ').trim()
  } else {
    return // 404 not found
  }
})

app.use(router.routes())

app.listen(5000)
console.log(`Listening on http://localhost:5000/`)
