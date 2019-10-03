# Baidu Hanyu Lookup Snackbar

Chrome extension that display a handful snackbar with pronunciation feature and quick dictionaries access when you select a chinese word in Chrome browser.

<p align="center">
  <img src="./screenshot.bmp" width="80%">
</p>


> ⚠️ This extension is not available on the store because the information used as the data foundation is of a private domain. Use for your own education only. You are free to copy and modify the code, but not as a commercial use intention.


## installation

- clone the repository
- install the dependencies : `npm i`
- build : `npm run build`
- load the folder inside of Chrome (from the extension interface)
- now when you select a chinese word on a webpage the snackbar appears.


# Korean search feature

The korean searching feature won't work because Naver will block cors fetch requests.
In order to use the korean feature you will have to run a local server, type the following in the extension folder :

```node korean-server```

This will run a local server on the port `5000`.
Now it should work.


## contact

vdegenne (at) gmail (dot) com
