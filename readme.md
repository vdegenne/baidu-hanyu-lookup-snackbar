# Baidu Hanyu Lookup Snackbar

Chrome extension that displays a handful snackbar with pronunciation feature and quick dictionaries access when you select a Chinese word in Chrome Browser.

> ⚠️ This repository is not maintain anymore. The continuation of this project is in private domain (use the email at the bottom of this readme if you are interesting about the current state of the project.)


<p align="center">
  <img src="./screenshot.bmp" width="80%">
</p>


> ⚠️ This extension is not available on the store because the information used as the data foundation is of private domains. Use for your own education only. You are free to copy and modify the code, but not for a commercial use intention.


## Installation

- clone the repository
- install the dependencies : `npm i`
- build : `npm run build`
- load the folder inside of Chrome (from the extension interface)
- now when you select a chinese word on a webpage the snackbar appears.


# Korean search feature

The korean searching feature won't work because Naver will block cors fetch requests.
In order to use the korean feature you will have to run a local server, type the following in the extension folder :

```node korean-server```

This will run a local server on the port `51022`.
Now it should work.


## Contact

vdegenne (at) gmail (dot) com
