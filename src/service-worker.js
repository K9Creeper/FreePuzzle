/// Ts kinda like handles the chrome cookies n shtuff;

let savedCookies = [];

let contentQueue = [];

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getCookies") {
        chrome.cookies.getAll({ domain: 'edpuzzle.com' }, function (cookies) {
            sendResponse(cookies);
        });

        return true;
    }
    else if (request.action === "clearCookies") {
        chrome.cookies.getAll({ domain: 'edpuzzle.com' }, function (cookies) {
            cookies.forEach(function (cookie) {
                if (cookie.name == "edpuzzleCSRF")
                    return;

                chrome.cookies.remove({
                    url: 'https://' + 'edpuzzle.com' + cookie.path,
                    name: cookie.name
                }, function () {

                });
            });
            sendResponse({ success: true, message: "All cookies cleared for edpuzzle.com." });
        });

        return true;
    } else if (request.action === "saveCookiesCheckpoint") {
        chrome.cookies.getAll({ domain: 'edpuzzle.com' }, function (cookies) {
            savedCookies = cookies;
            sendResponse({ success: true, message: "Cookies saved successfully." });
        });
        return true;
    }
    else if (request.action === "restoreCookiesCheckpoint") {
        // Restore the saved cookies
        if (savedCookies.length === 0) {
            sendResponse({ success: false, error: "No saved cookies checkpoint found." });
            return true;
        }

        let restorePromises = savedCookies.map(cookie => {
            return new Promise((resolve, reject) => {
                const cookieDetails = {
                    url: 'https://edpuzzle.com',
                    name: cookie.name,
                    value: cookie.value,
                    domain: 'edpuzzle.com',
                    path: cookie.path || '/',
                    secure: cookie.secure !== undefined ? cookie.secure : true,
                    httpOnly: cookie.httpOnly !== undefined ? cookie.httpOnly : false,
                    sameSite: cookie.sameSite || 'Lax',
                    expirationDate: cookie.expirationDate || (Date.now() / 1000) + 3600
                };

                chrome.cookies.set(cookieDetails, function (cookie) {
                    if (chrome.runtime.lastError) {
                        reject(new Error('Failed to restore cookie: ' + chrome.runtime.lastError.message));
                    } else if (cookie) {
                        resolve(cookie);
                    } else {
                        reject(new Error('Unknown error while restoring cookie'));
                    }
                });
            });
        });

        Promise.all(restorePromises)
            .then(() => {
                sendResponse({ success: true, message: "Cookies restored successfully." });
            })
            .catch(error => {
                sendResponse({ success: false, error: error.message });
            });

        return true;
    }else if (request.action == "enableSkipVideo") {
        sendResponse({ success: true });

        contentQueue.push(request);

        return true;
    }else if(request.action == 'getCommandQueue')
    {
        sendResponse({success: true, queue: contentQueue});

        return true;
    }else if(request.action == 'clearCommandQueue')
    {
        contentQueue = [];

        sendResponse({success: true});

        return true;
    }
});
