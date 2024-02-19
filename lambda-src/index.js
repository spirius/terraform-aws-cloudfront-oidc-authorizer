const https = require('https');
const fs = require('fs');
const jwk = require('./jwk.js');
const crypto = require('crypto');

const config = JSON.parse(fs.readFileSync('./config.json'));

config.redirectUriObject = new URL(config.redirectUri);

const userViewerRequestHandler = config.viewerRequestHandler ? require('./viewer-request-handler.js') : null;
const userViewerResponseHandler = config.viewerResponseHandler ? require('./viewer-response-handler.js') : null;

const jwkSet = {};

config.jwks.keys.forEach(function(key) {
    jwkSet[key.kid] = jwk.toKeyObject(key);
});

function getTokenFromCookie(headers) {
    return (headers || [])
        .map((h) => h.value.split("; "))
        .flat()
        .map((h) => h.split("=", 2))
        .filter((h) => h[0].startsWith(config.cookieNamePrefix))
        .map(([key, value]) => ({
            key: parseInt(key.substr(config.cookieNamePrefix.length)),
            value,
        }))
        .sort((a, b) => a.key - b.key)
        .map(({key, value}) => decodeURIComponent(value))
        .join("");
}

function setTokenIntoCookie(headers, tokenData, expires) {
    let i = 0, s = 0;
    for (; s < tokenData.length; i++, s+= config.cookieChunkMaxLength) {
        const chunk = encodeURIComponent(tokenData.substr(s, config.cookieChunkMaxLength));
        headers.push({
            key: "Set-Cookie",
            value: `${config.cookieNamePrefix}${i}=${chunk}; HttpOnly; Secure; Path=/; Expires=${expires.toISOString()}`
        });
    }
    for (let j = i; j < config.cookieMaxCount; j++) {
        headers.push({
            key: "Set-Cookie",
            value: `${config.cookieNamePrefix}${j}=; HttpOnly; Secure; Path=/; Expires=${new Date(0).toISOString()}`
        });
    }
}

function base64urldecode(data) {
    return Buffer.from(data
        .replace(/\-/g, '+')
        .replace(/\_/g, '/') + "===", 'base64');
}

function verifyToken(tokenData) {
    const segments = tokenData.split(".");

    let keyInfo = null;
    try {
        keyInfo = JSON.parse(base64urldecode(segments[0]));
    } catch(e) {
        return false;
    }
    if (!keyInfo) {
        return false;
    }
    const key = jwkSet[keyInfo.kid];
    if (!key) {
        return false;
    }

    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(segments.slice(0, 2).join("."));

    if (!verifier.verify(key, base64urldecode(segments[2]))) {
        return false;
    }

    let token = null;
    try {
        token = JSON.parse(base64urldecode(segments[1]));
    } catch(e) {
        return false;
    }
    if (token.iss !== config.issuer) {
        return false;
    }
    return true;
}

async function tokenEndpointRequest(body) {
    return new Promise((resolve, reject) => {
        let data = Buffer.alloc(0);
        const req = https.request(
            config.tokenEndpoint,
            {
                method: 'POST',
                auth: `${config.clientId}:${config.clientSecret}`,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                }
            },
            (res) => {
                res.on('data', (chunk) => {
                    data = Buffer.concat([data, chunk]);
                });
                res.on('end', () => {
                    if (res.statusCode != 200) {
                        return reject(`bad status code ${res.statusCode}`);
                    }
                    resolve(data);
                });
            }
        );
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

async function getToken(code) {
    const body = new URLSearchParams();
    body.append('grant_type', 'authorization_code');
    body.append('client_id', config.clientId);
    body.append('redirect_uri', config.redirectUri);
    body.append('code', code);

    return await tokenEndpointRequest(body.toString());
}

async function refreshToken(token) {
    const body = new URLSearchParams();
    body.append('grant_type', 'refresh_token');
    body.append('client_id', config.clientId);
    body.append('redirect_uri', config.redirectUri);
    body.append('refresh_token', token.refresh_token);

    try {
        const tokenData = await tokenEndpointRequest(body.toString());
        const newToken = JSON.parse(tokenData);
        Object.assign(token, newToken);
        token.deadline = parseInt((new Date()).getTime() + token.expires_in * config.tokenDeadlineScale);
        return token;
    } catch(e) {
        console.error(e);
        return null;
    }
}

async function viewerRequestHandler(request, event) {
    const tokenData = getTokenFromCookie(request.headers.cookie);

    let token = null;
    if (tokenData) {
        try {
            token = JSON.parse(tokenData);
        } catch(e) {}
    }

    delete(request.headers[config.tokenExchangeHeader.toLowerCase()]);

    if (token && token.deadline < new Date().getTime()) {
        token = await refreshToken(token);
        if (token) {
            const tokenData = JSON.stringify(token);
            const newTokenHeader = [];
            for (let i = 0, s = 0; s < tokenData.length; i++, s+= config.cookieChunkMaxLength) {
                newTokenHeader.push({
                    key: config.tokenExchangeHeader,
                    value: tokenData.substr(s, config.cookieChunkMaxLength),
                });
            }
            request.headers[config.tokenExchangeHeader.toLowerCase()] = newTokenHeader;
        }
    }

    if (!token) {
        const qs = new URLSearchParams(request.querystring || "");

        if (request.uri === config.redirectUriObject.pathname && qs.has("code")) {
            const tokenData = await getToken(qs.get("code"));
            token = JSON.parse(tokenData);
            token.deadline = parseInt(new Date().getTime() + token.expires_in * config.tokenDeadlineScale);

            const state = JSON.parse(qs.get("state"));

            const returnUrl = new URL(config.redirectUri);
            returnUrl.pathname = state.uri;
            returnUrl.search = state.querystring;

            request = {
                status: '302',
                statusDescription: 'Found',
                headers: {
                    location: [{
                        key: 'Location',
                        value: returnUrl.toString(),
                    }],
                    'set-cookie': [],
                }
            };

            setTokenIntoCookie(request.headers['set-cookie'], JSON.stringify(token), new Date(token.deadline));
        } else {
            const authURL = new URL(config.authorizationEndpoint);
            authURL.searchParams.append('response_type', 'code');
            authURL.searchParams.append('client_id', config.clientId);
            authURL.searchParams.append('redirect_uri', config.redirectUri);
            authURL.searchParams.append('scope', config.scope);
            authURL.searchParams.append('state', JSON.stringify({uri: request.uri, querystring: request.querystring}));

            request = {
                status: '302',
                statusDescription: 'Found',
                headers: {
                    location: [{
                        key: 'Location',
                        value: authURL.toString(),
                    }],
                    'set-cookie': [],
                },
            };
            setTokenIntoCookie(request.headers['set-cookie'], "", null);
        }
    }

    if (token && (!token.access_token || !verifyToken(token.access_token))) {
        request = {
            status: '401',
            statusDescription: 'Forbidden',
            headers: {
                'set-cookie': [],
            }
        };
        setTokenIntoCookie(request.headers['set-cookie'], "", null);
    }

    if (userViewerRequestHandler) {
        if (userViewerRequestHandler.constructor.name === 'AsyncFunction') {
            request = await userViewerRequestHandler(event, request);
        } else {
            request = userViewerRequestHandler(event, request);
        }
    }

    return request;
}

async function viewerResponseHandler(request, response) {
    const headerName = config.tokenExchangeHeader.toLowerCase();

    if (request.headers[headerName]) {
        const tokenData = request.headers[headerName].map((h) => h.value).join("");
        response.headers['set-cookie'] = response.headers['set-cookie'] || [];
        setTokenIntoCookie(response.headers['set-cookie'], tokenData, new Date(JSON.parse(tokenData).deadline));
    }

    return response;
}

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const response = event.Records[0].cf.response;
    const eventType = event.Records[0].cf.config.eventType;

    let res = null;

    switch(eventType) {
    case 'viewer-request':
        res = await viewerRequestHandler(request, event);
        if (userViewerRequestHandler) {
            if (userViewerRequestHandler.constructor.name === 'AsyncFunction') {
                res = await userViewerRequestHandler(event, res);
            } else {
                res = userViewerRequestHandler(event, res);
            }
        }
        break;
    case 'viewer-response':
        res = await viewerResponseHandler(request, response, event);
        if (userViewerResponseHandler) {
            if (userViewerResponseHandler.constructor.name === 'AsyncFunction') {
                res = await userViewerResponseHandler(event, res);
            } else {
                res = userViewerResponseHandler(event, res);
            }
        }
        break;
    default:
        throw new Error(`unknown event type ${eventType}`);
    }

    return res;
}
