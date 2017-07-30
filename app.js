'use strict';

const express = require('express');
const http = require('http');
// var path = require('path');
// var favicon = require('serve-favicon');
const logger = require('morgan');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const NEDB = require('nedb');
const sha1 = require('sha1')
const bodyParser = require('body-parser');
const url = require('url');
const WebSocket = require('ws');
const Client = require('./Client.js');

const {Phd} = require('./Phd');
const {IndiManager} = require('./IndiManager');
const {Camera} = require('./Camera');

const JsonProxy = require('./JsonProxy');

// var index = require('./routes/index');
// var users = require('./routes/users');

const app = express();


var session = require('express-session');
var FileStore = require('session-file-store')(session);

app.use(express.static('ui/build'));

var sessionParser;
app.use(sessionParser = session({
    store: new FileStore({}),
    cookie: {
        maxAge: 31 * 24 * 3600000,
        secure: false
    },
    saveUninitialized: true,
    resave: false,
    unset: 'destroy',
    secret: 'where this secret should be stored?'
}));

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))

// parse application/json
app.use(bodyParser.json());

app.use(cors({
    origin: true,
    credentials: true
}));


var appStateManager = new JsonProxy.JsonProxy();
var appState = appStateManager.getTarget();

appState.apps= {
    phd: {
        enabled: true,
        position: 1
    },
    indiManager: {
        enabled: true,
        position: 2
    },
    camera: {
        enabled: true,
        position: 3
    }
};


var phd;
var indiManager;
var camera;

phd = new Phd(app, appStateManager);

indiManager = new IndiManager(app, appStateManager);

camera = new Camera(app, appStateManager, indiManager);

app.use(function(req, res, next) {
    if ('jsonResult' in res) {
        res.status(200);
        res.contentType('application/json');
        // res.header('Cache-Control', 'no-cache');
        res.header("Cache-Control", "no-cache, no-store, must-revalidate");
        res.header("Pragma", "no-cache");
        res.header("Expires", 0);
        console.log('API Returning: ' + JSON.stringify(res.jsonResult));
        res.send(JSON.stringify(res.jsonResult));
    } else {
        next();
    }
});

const server = http.createServer(app);

const wss = new WebSocket.Server({ server: server });

//wss.use(sharedsession(session));

wss.on('connection', function connection(ws) {
    var client;

    client = new Client(ws);

    ws.on('message', function incoming(message) {
        if (!client) {
            ws.terminate();
            return;
        }

        console.log('received from ' + client.uid + ': %s', message);

        try {
            message = JSON.parse(message);
        } catch(e) {
            console.log('Invalid message', e);
            ws.terminate();
            return;
        }

        if ('method' in message) {
            console.log('Got action message');
            var target = message.target;
            var targetObj = undefined;

            var reply = function(r) {
                console.log('replying with ' + JSON.stringify(r));
                client.reply(r);
            };

            // FIXME: remove that hard coded duplicate code
            switch(target) {
                case 'phd':
                    targetObj= phd;
                    break;
                case 'indiManager':
                    targetObj = indiManager;
                    break;
                case 'camera':
                    targetObj = camera;
                    break;
                default:
                    reply({status: 'ko', details: 'invalid target'});
                    return;
            }

            try {
                targetObj[message.method](message, reply);
            } catch(e) {
                reply({status: 'ko', details: 'error: ' + e});
            }
        }
    });

    ws.on('close', function (code, reason) {
        if (client) {
            console.log('Websocket closed : ' + code);
            client.dispose();
        } else {
            console.log('Websocket closed (anonymous) : ' + code);
        }
    });

    client.attach(appStateManager);

});

var port = parseInt(process.env.PORT || '8080');
app.set('port', port);

server.listen(port);

module.exports = app;
