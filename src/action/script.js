/* void | contact the other .js */
function FreePuzzle_SendMessagePromise(message) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError); // Reject if an error occurred
            } else {
                resolve(response); // Resolve with the response
            }
        });
    });
}


async function skipVideo() {
    console.log(await FreePuzzle_SendMessagePromise({ action: "enableSkipVideo" }));
}

document.getElementById('skip').addEventListener('click', async function () {
    await skipVideo();
});
