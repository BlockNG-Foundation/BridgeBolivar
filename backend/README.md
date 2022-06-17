## Installation

### Prepare

We prefer Node v14:

https://github.com/nodesource/distributions


```
sudo npm i -g pm2
pm2 install pm2-logrotate
pm2 set pm2-logrotate-ext:max_size 1M
pm2 conf pm2-logrotate

```
### Dependency
```
npm i
```

## KeyStore

### use an exist keystore

set password in .env
```
vi .env
PW = "1a2b3c3d"
```
then put keystorefile in a name of 
```
.keystore.json
```


### generate new keystore

```
vi .env
PW = "1a2b3c3d"
node createKeystore.js
```
You will get a .keystore.json with the password you set



## Launch

```
npm run pm2
rm .env (optional,but need create .env everytime restart)
```


