const FreePuzzle_API_URL = "https://edpuzzle.com/api/v3/";
const FreePuzzle_API2_URL = "https://edpuzzle.com/api/v4/";

const FreePuzzle_ASCII = `
 __                                      _      
/ _|                                    | |     
| |_ _ __ ___  ___   _ __  _   _ _______| | ___ 
|  _| '__/ _ \\/ _ \\ | '_ \\| | | |_  /_  / |/ _ \\
| | | | |  __/  __/ | |_) | |_| |/ / / /| |  __/
|_| |_|  \\___|\\___| | .__/ \\__,_/___/___|_|\\___|
                    | |                         
                    |_|                                               
`;

const FreePuzzle_TeacherEmail = "k9creeper20@gmail.com";
const FreePuzzle_TeacherPassword = "ljRCo\\U=R6\\#0oe5";

let FreePuzzle_worker = null;
let FreePuzzle_loaderWorker = null;

/* Multiple Choice Question Structure */
/*
{
    body: [ 
        {
            html: string,
            text: string,
            _id: string
        }    
    ],
    choices: [
        {
           body: [ 
                {
                    html: string,
                    text: string,
                    _id: string
                }    
            ],
            choiceNumber: int,
            feedback: [ 
                {
                    html: string,
                    text: string,
                    _id: string
                }    
            ],
            isCorrect: boolean,
            _id: string
        }
    ],
    createdBy: string,
    duration: number,
    questionNumber: int,
    time: double,
    // "open-ended", "multiple-choice", ....
    type: string,
    // if type == "open-ended", may not always be a variable
    idealAnswer: string,
    _id: string
}
*/

/* void | just a sleep function */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/* void | contact the orther .js */
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

/* returns a string | gets the edpuzzle client version */
function FreePuzzle_GetClientVersion() {
    return document.documentElement.innerHTML.match(/window\.__EDPUZZLE_DATA__\s*=\s*\{[^}]*\s*version\s*:\s*"([^"]+)"/)?.[1];
}

/* returns a string | gets a valid CSRF token */
async function FreePuzzle_GetCSRFToken() {
    const csrfResponse = await fetch('https://edpuzzle.com/api/v3/csrf', {
        method: 'GET'
    });

    const csrfData = await csrfResponse.json();
    return csrfData.CSRFToken;
}

/* returns a string | it is the assignment id based off of the current page */
function FreePuzzle_GetAssignementId() {
    const path = window.location.pathname;
    return path.substring(path.indexOf("assignments/") + ("assignments/").length, path.indexOf("/watch"));
}

/* returns a string | it is a edpuzzle api url */
function FreePuzzle_GetAssignementIdUrl(sAssignmentId) {
    return `${FreePuzzle_API_URL}assignments/${sAssignmentId}`;
}

/* returns a string | it is a edpuzzle api url */
function FreePuzzle_GetAttemptUrl(sAssignmentId) {
    return FreePuzzle_GetAssignementIdUrl(sAssignmentId) + "/attempt";
}

/* returns a string | it is a edpuzzle api url */
function FreePuzzle_GetMediaUrl(contentId) {
    return `${FreePuzzle_API_URL}media/${contentId}`;
}

/* returns a boolean | based whether the user is in the correct domain */
function FreePuzzle_InCorrectDir() {
    return (window.location.hostname.includes('edpuzzle.com') &&
        window.location.pathname.includes("/watch") &&
        window.location.pathname.includes("/assignments/"));
}

/* returns a html element | gets the viewport of the MAIN edpuzzle thing */
function FreePuzzle_GetEdPuzzleVP() {
    return document.querySelector("body > div > div > div > div > div > main > div > div > div > div > div").children[1];
}

/* returns list of html elements | gets info */
function FreePuzzle_GetQuestionVP() {
    const half = FreePuzzle_GetEdPuzzleVP().children[1].children[1].children[0];
    const lis = half.children[half.children.length - 1].children;
    for (let i = 0; i < lis.length; i++) {
        const li = lis[i];
        if (li.className.includes("LD3oggZGVU")) {
            return li.querySelector("div > div > article");
        }
    }
    return undefined;
}

/* returns a array of choice structures | takes in a question structure */
function FreePuzzle_GetChoiceAnswers(jQuestion) {
    const choices = jQuestion.choices;
    let out = [];
    for (let i = 0; i < choices.length; i++) {
        const c = choices[i];
        if (c.isCorrect)
            out.push(c);
    }
    return out;
}

/* returns a string | takes in a question structure, and returns a possible answer */
async function FreePuzzle_GetOpenEndedResponse(sTitle, videoLink, jQuestion) {
    const idealAnswer = jQuestion.idealAnswer;

    if (idealAnswer !== undefined && idealAnswer.length > 0) {
        return idealAnswer;
    }

    const htmlRegexG = /<(?:"[^"]*"['"]*|'[^']*'['"]*|[^'">])+>/g;
    let prompt = "";
    jQuestion.body.forEach((e) => {
        prompt += e.html.replace(htmlRegexG, "");
        prompt += "\n";
    });

    /* Contains the Gemini API link and Api Key. */
    const apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=AIzaSyAj-wkm7S2PXtwrZaJ0H_xrVCCQEl7AHrg";

    /* This contains the data being sent to Gemini. */
    const postData = {
        contents: [
            {
                "parts": [
                    {
                        "text": `
                            **Scenario:** A student has watched a video titled '${sTitle}'. 
                            **Video Link:** ${videoLink} 
                            **Prompt:** ${prompt}

                            **Instructions:**
                            1. **Answer the prompt directly.** 
                            2. **Keep your response concise and to the point.** 
                            3. **If the 'videoLink' is invalid or inaccessible:**
                            
                            * **Base your answer solely on the provided 'sTitle'.**
                            * **If insufficient information is available from either 'sTitle' or 'prompt', respond with '~~NONE~~'.**

                            **Important:** 
                            * **Do NOT:**
                            * Indicate any need for additional information.
                            * Include any extraneous information in your response.
                        `
                    }
                ]
            }
        ]
    };

    // Convert the object to a JSON string
    const jsonData = JSON.stringify(postData);

    let strResponse = null;
    await fetch(apiUrl, {
        method: 'POST',
        headers: new Headers({
            "Content-Type": "application/text"
        }),
        body: jsonData
    }).then((response) => response.json()).then((json) => {
        strResponse = json.candidates[0].content.parts[0].text;
    });

    return (strResponse.includes("~~NONE~~") ? "" : strResponse);
}

/* returns a json structure | takes in an assignment id */
async function FreePuzzle_GetAssigmentJSON(sAssignmentId) {
    /* the url to fetch */
    const assignmentUrl = FreePuzzle_GetAssignementIdUrl(sAssignmentId);

    /* pre-define a holder for the json */
    let JSON = null;

    /* await so the pre-define is set & fetch */
    await fetch(assignmentUrl).then((response) => response.json()).then((json) => {
        JSON = json;
    });

    return JSON;
}

/* returns a json structure | takes in an assignment id */
async function FreePuzzle_GetAttemptJSON(sAssignmentId) {
    const url = FreePuzzle_GetAttemptUrl(sAssignmentId);

    /* pre-define a holder for the json */
    let JSON = null;

    /* await so the pre-define is set & fetch */
    await fetch(url).then((response) => response.json()).then((json) => {
        JSON = json;
    });

    return JSON;
}

/* returns a json structure | takes in an id */
async function FreePuzzle_GetMediaJSON(contentId) {
    /* the url to fetch */
    const mediaUrl = FreePuzzle_GetMediaUrl(contentId);

    /* pre-define a holder for the json */
    let data = null;

    /* await so the pre-define is set & fetch */
    await fetch(mediaUrl).then((response) => response.json()).then((json) => {
        data = json;
    });

    return data;
}

/* void | takes in a teacher account user and password field*/
async function FreePuzzle_TeacherLogin(username, password) {
    const request = {
        username: username,
        password: password,
        role: 'teacher'
    };

    const version = FreePuzzle_GetClientVersion();

    const csrf = await FreePuzzle_GetCSRFToken();

    const md5Hash = md5(JSON.stringify(request)).slice(0, 4);
    const multiplyBy = Number(version.split('.')[2]) + 10;
    const dateIncrease = Math.floor(Date.now() / 1000) * multiplyBy;

    try {
        const response = await FreePuzzle_SendMessagePromise({
            action: "clearCookies",
        });

        console.log(response.message);
    } catch (error) {
        console.error("Error clearing cookies: ", error);
    }

    const loginResponse = await fetch('https://edpuzzle.com/api/v3/users/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': JSON.stringify(request).length.toString(),
            'x-chrome-version': '134',
            'x-csrf-token': csrf,
            'x-edpuzzle-preferred-language': 'en',
            'x-edpuzzle-referrer': 'https://edpuzzle.com/discover',
            'x-edpuzzle-web-version': version + '.' + md5Hash + dateIncrease
        },
        body: JSON.stringify(request)
    });

    if (!loginResponse.ok) {
        console.error('Login failed:', loginResponse.status, loginResponse.statusText);
        return;
    }

    const auth = loginResponse.headers.get('authorization')?.replace('Bearer ', '').trim() || '';

    console.log('Logged in as teacher!');

    if (!auth.startsWith('ey')) {
        console.error('This authorization token does not appear to be valid.');
    } else {
        console.log('Authorization token is valid.');
    }
}

async function FreePuzzle_ProccessQuestions(assignemntJSON, mediaJSON) {
    const htmlRegexG = /<(?:"[^"]*"['"]*|'[^']*'['"]*|[^'">])+>/g;
    const htmlRegexGCode = /&[a-zA-Z0-9#]+;/g;

    let questions = mediaJSON.questions;

    let proccessedQuestions = [];

    for (let i = 0; i < questions.length; i++) {
        if (questions[i].type === "open-ended") {
            const openEndedRes = await FreePuzzle_GetOpenEndedResponse(assignemntJSON.medias[0].title, (mediaJSON.source === "youtube" ? `https://www.youtube.com/watch/${mediaJSON.videoId}` : "unkown"), questions[i]);
            proccessedQuestions[`${questions[i].body[0].html.replace(htmlRegexG, "").replace(htmlRegexGCode, "")}`] = {
                type: questions[i].type,
                answers: openEndedRes
            };
        } else if (questions[i].type.includes("choice") || questions[i].choices !== undefined) {
            const answers = FreePuzzle_GetChoiceAnswers(questions[i]);
            proccessedQuestions[`${questions[i].body[0].html.replace(htmlRegexG, "").replace(htmlRegexGCode, "")}`] = {
                type: questions[i].type,
                answers: answers
            };
        }
    }

    return proccessedQuestions;
}

/* returns a boolean | checks if a certian element exists on the page, if so that means a question is being asked */
function FreePuzzle_IsQuestionAsked() {
    return (document.getElementsByClassName("LjTjX0QjOD").length == 1) && FreePuzzle_GetQuestionVP().querySelector("header > div > section > span > p");
}

/* returns a html element | ... */
function FreePuzzle_GetMultipleChoicesChoiceHTML(answer) {
    return document.getElementById(answer._id);
}

/* void | sends a request to allow the user to skip through the video */
async function FreePuzzle_SkipVideo(id) {
    const url = FreePuzzle_API2_URL + "media_attempts/" + id + "/watch";

    const data = {
        "timeIntervalNumber": 10
    };

    const version = FreePuzzle_GetClientVersion();
    const csrf = await FreePuzzle_GetCSRFToken();

    await fetch(url, {
        method: "POST",
        headers: {
            'accept': 'application/json, text/plain, */*',
            'accept_language': 'en-US,en;q=0.9',
            'content-type': 'application/json',
            'x-csrf-token': csrf,
            'x-edpuzzle-referrer': "https://edpuzzle.com/assignments/" + id + "/watch",
            "x-edpuzzle-web-version": version
        },
        body: JSON.stringify(data)
    });
}

/* a handle under FreePuzzle_Worker (interval), executes every 50ms */
async function FreePuzzle_WorkerHandle(assignemntJSON, mediaJSON, proccessedQuestions) {
    if (!FreePuzzle_InCorrectDir()) {
        clearInterval(FreePuzzle_worker);
        FreePuzzle_worker = null;

        if (!FreePuzzle_loaderWorker) {
            console.log("FreePuzzle | Loading || On Standby");
            FreePuzzle_loaderWorker = setInterval(FreePuzzle_LoaderHandle, 50);
        }
        return;
    }
    const htmlRegexG = /<(?:"[^"]*"['"]*|'[^']*'['"]*|[^'">])+>/g;
    const htmlRegexGCode = /&[a-zA-Z0-9#]+;/g;
    const qoutesRegexG = /(")|(')/g

    const queue = await FreePuzzle_SendMessagePromise({ action: "getCommandQueue" });
    await FreePuzzle_SendMessagePromise({ action: "clearCommandQueue" });

    for (const message of queue.queue) {
        if (message.action == "enableSkipVideo") {
            const sAssignmentId = FreePuzzle_GetAssignementId();
            const attemptJSON = await FreePuzzle_GetAttemptJSON(sAssignmentId);

            await FreePuzzle_SkipVideo(attemptJSON._id);

            location.reload(true);
        }
    }

    if (!FreePuzzle_IsQuestionAsked())
        return;

    const questionDiv = FreePuzzle_GetQuestionVP().querySelector("header > div > section > span > p");
    if (questionDiv === undefined)
        return;

    const sQuestion = questionDiv.innerHTML;
    let qQuestion = undefined;

    for (const key in proccessedQuestions) {
        if (key == sQuestion.replace(htmlRegexGCode, "").replace(qoutesRegexG, "")) {
            qQuestion = proccessedQuestions[key];
        }
    }

    if (qQuestion == undefined)
        return;

    if (qQuestion.type !== "open-ended") {
        for (let i = 0; i < qQuestion.answers.length; i++) {
            const answer = qQuestion.answers[i];
            const element = FreePuzzle_GetMultipleChoicesChoiceHTML(answer);

            if (element !== undefined) {
                element.parentElement.parentElement.parentElement.style.backgroundColor = "#00FF00";
            }
        }
    } else {
        const answer = qQuestion.answers;

    }
}

let FreePuzzle_lastHref = "";
async function FreePuzzle_LoaderHandle() {
    const current = window.location.href;

    if (current !== FreePuzzle_lastHref && FreePuzzle_lastHref !== "") {
        FreePuzzle_lastHref = "";
        if (FreePuzzle_loaderWorker) {
            clearInterval(FreePuzzle_loaderWorker);
            FreePuzzle_loaderWorker = null;
        }
        FreePuzzle_Initialize();
        return;
    }
    FreePuzzle_lastHref = current;
}

/* this will get everything about the current assignnment */
async function FreePuzzle_Initialize() {
    if (!FreePuzzle_InCorrectDir()) {
        console.log("FreePuzzle | Loading || On Standby");
        FreePuzzle_loaderWorker = setInterval(FreePuzzle_LoaderHandle, 50);
        return;
    }
    await FreePuzzle_SendMessagePromise({ action: "clearCommandQueue" });

    /* LOL GET REBRANEDED LOSER */

    console.clear();
    console.log(FreePuzzle_ASCII);

    await sleep(1000);

    console.log("FreePuzzle | Loading || Questions");

    const sAssignmentId = FreePuzzle_GetAssignementId();
    const assignemntJSON = await FreePuzzle_GetAssigmentJSON(sAssignmentId);

    try {
        const response = await FreePuzzle_SendMessagePromise({
            action: "saveCookiesCheckpoint",
        });

        console.log(response.message);
    } catch (error) {
        console.error("Error setting cookie checkpoint: ", error);
    }

    await FreePuzzle_TeacherLogin(FreePuzzle_TeacherEmail, FreePuzzle_TeacherPassword);

    const mediaJSON = await FreePuzzle_GetMediaJSON(assignemntJSON.teacherAssignments[0].contentId);

    try {
        const response = await FreePuzzle_SendMessagePromise({
            action: "restoreCookiesCheckpoint",
        });

        console.log(response.message);
    } catch (error) {
        console.error("Error restoring cookie checkpoint: ", error);
    }

    const proccessedQuestions = await FreePuzzle_ProccessQuestions(assignemntJSON, mediaJSON);

    console.log("FreePuzzle | Initializing || Proccessed Questions");

    console.log("FreePuzzle | Initializing || Running Worker..");

    FreePuzzle_worker = setInterval(FreePuzzle_WorkerHandle, 50, assignemntJSON, mediaJSON, proccessedQuestions);
}

FreePuzzle_Initialize();