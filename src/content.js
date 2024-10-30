const FreePuzzle_API_URL = "https://edpuzzle.com/api/v3/";

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
function FreePuzzle_GetMediaUrl(sContentId) {
    return `${FreePuzzle_API_URL}media/${sContentId}`;
}

/* returns a boolean | based whether the user is in the correct domain */
function FreePuzzle_InCorrectDir() {
    return (window.location.hostname.includes('edpuzzle.com') &&
        window.location.pathname.includes("/watch") &&
        window.location.pathname.includes("/assignments/"));
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
    if (idealAnswer !== undefined) {
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
                    { "text": `The student just watched a video based on the title '${sTitle}', the video link is: ${videoLink}. Please answer the prompt: ${prompt}. DO NOT respond with anything other than the answer, do a minimal response and not include anything extra. If the video link is unkown or cannot be accessed just go off of context from the title; DO NOT SAY YOU NEED MORE INFORMATION, CONTEXT, OR THAT YOU NEED TO SEE THE VIDEO TO ANSWER THE QUESTION.` }
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

    return strResponse;
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

/* returns a json structure | takes in an content id */
async function FreePuzzle_GetMediaJSON(sContentId) {
    /* the url to fetch */
    const mediaUrl = FreePuzzle_GetMediaUrl(sContentId);

    /* pre-define a holder for the json */
    let JSON = null;

    /* await so the pre-define is set & fetch */
    await fetch(mediaUrl, {
        method: 'GET',
        headers: new Headers({
            "User-Agent": "PostmanRuntime/7.36.3"
        }),
        credentials: 'omit'
    }).then((response) => response.json()).then((json) => {
        JSON = json;
    });

    return JSON;
}

async function FreePuzzle_ProccessQuestions(assignemntJSON, mediaJSON){
    const htmlRegexG = /<(?:"[^"]*"['"]*|'[^']*'['"]*|[^'">])+>/g;
    const htmlRegexGCode = /&[a-zA-Z0-9#]+;/g;

    let questions = mediaJSON.questions;

    let proccessedQuestions = [];

    for (let i = 0; i < questions.length; i++) {
        if (questions[i].type === "open-ended") {
            const openEndedRes = await FreePuzzle_GetOpenEndedResponse(assignemntJSON.medias[0].title, (mediaJSON.source === "youtube" ? `https://www.youtube.com/watch/${mediaJSON.videoId}` : "unkown"), questions[i]);
            proccessedQuestions[`${questions[i].body[0].html.replace(htmlRegexG, "").replace(htmlRegexGCode, "")}`] = openEndedRes;
        }else if(questions[i].type.includes("choice") || questions[i].choices !== undefined){
            const answers = await FreePuzzle_GetChoiceAnswers(questions[i]);
            proccessedQuestions[`${questions[i].body[0].html.replace(htmlRegexG, "").replace(htmlRegexGCode, "")}`] = answers;
        }
    }

    return proccessedQuestions;
}

/* returns a boolean | checks if a certian element exists on the page, if so that means a question is being asked */
function FreePuzzle_IsQuestionAsked(){
    return (document.getElementsByClassName("LjTjX0QjOD").length == 1);
}

/* returns a html element | ... */
function FreePuzzle_GetMultipleChoiceChoicesHTML(sAnswer){
    const ul = document.getElementsByClassName("S22KF9HiqC")[0];
    if(sAnswer === undefined)
        return ul;
    let choiceHTML = null;
    ul.children.forEach((e)=>{
        const c = (e.getElementsByClassName("kvVVRmoyRB NVoSF83SAC hsU0UJ0TaS duNyBf_CZP QIUj5uyqT_ _8iDl0vnnei")[0]);
        if(c.innerText == sAnswer)
            choiceHTML = c;
    });
    return choiceHTML;
}

/* this will get everything about the current assignnment */
async function FreePuzzle_Initialize() {
    if (!FreePuzzle_InCorrectDir()) {
        return;
    }
    const sAssignmentId = FreePuzzle_GetAssignementId();
    const assignemntJSON = await FreePuzzle_GetAssigmentJSON(sAssignmentId);
    const mediaJSON = await FreePuzzle_GetMediaJSON(assignemntJSON.teacherAssignments[0].contentId);

    const proccessedQuestions = await FreePuzzle_ProccessQuestions(assignemntJSON, mediaJSON);

    
}

FreePuzzle_Initialize();