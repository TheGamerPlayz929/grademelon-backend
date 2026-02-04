const express = require('express');
const axios = require('axios');
const tough = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const FormData = require('form-data');
const CryptoJS = require('crypto-js');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const { JSDOM } = require('jsdom');
const slowDown = require("express-slow-down");

const encryptionKey = process.env.encryptionkey;
const bannedIps=process.env.banList;

const app = express();

const viewStates=new Map()

const userCount=new Set()

const ipBan = (req,res,next)=>{console.log(req.headers['x-forwarded-for']);console.log("flavor text");if(bannedIps.includes(req.headers['x-forwarded-for'].split(',')[0])){return res.status(405).send("u been banned")};next()};

const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 100,
  delayMs: 500,
  keyGenerator:(req,res)=>{
    return req.headers['x-forwarded-for'].split(',')[0]
  },
  onLimitReached: (req, res, options) => {
    console.log(`Limit reached for IP: ${req.headers['x-forwarded-for'].split(',')[0]}`);
  },
});

const taskMap = new Map();

app.use(ipBan);
//app.use(speedLimiter) no can do, school is all one big ip...
app.use(express.json());
app.use(cors());


setInterval(()=>{
    console.log(taskMap);
    for(const [key,value] of taskMap.entries()){
        if(Date.now()-value[0] > 30*60*1000){
            taskMap.delete(key)
        }

    }

},1800000);

setInterval(()=>{
  console.log(`Daily User Count: ${userCount.size}`)
  userCount.clear()
  
},86400000)
//refresh viewStates
setInterval(async ()=>{
  for(const [domain,states] of viewStates.entries()){
    console.log(domain);console.log(states);
    await axios.get(domain+"/PXP2_Login_Student.aspx?regenerateSessionId=True").then(response=>{
        const [VIEWSTATE, EVENTVALIDATION]=parseFormData(response.data);
    viewStates.set(domain,[VIEWSTATE,EVENTVALIDATION])}).catch(error=>{console.log(error);})}
    
  
  
},21600000)

function decryptDetails(req){
    const bytes = CryptoJS.AES.decrypt(req.body.credentials.password, encryptionKey);
    const originalText = bytes.toString(CryptoJS.enc.Utf8);
    const details=req.body;
    details.credentials.password=originalText;
    ////console.log(details)
    details.domain= details.domain?.endsWith('/') ? details.domain?.slice(0, -1) : details.domain;
    return(details)
}


function parseFormData(loginPage) {
    const dom = new JSDOM(loginPage);
    const document = dom.window.document;

    const viewStateElement = document.getElementById('__VIEWSTATE');
    const eventValidationElement = document.getElementById('__EVENTVALIDATION');

    const _VIEWSTATE = viewStateElement ? viewStateElement.value : null;
    const _EVENTVALIDATION = eventValidationElement ? eventValidationElement.value : null;
    ////console.log(_VIEWSTATE);////console.log(_EVENTVALIDATION);

    return [_VIEWSTATE, _EVENTVALIDATION];
}



async function logIn(details,session) {
    return new Promise(async (res, rej)=>{
    const url = details.domain+"/PXP2_Login_Student.aspx?regenerateSessionId=True";
    try{
    if(!viewStates.has(details.domain)){
    console.log("another axios")
    const response2 = await axios.get(url).catch(error=>{return rej(error)})
    const [VIEWSTATE, EVENTVALIDATION]=parseFormData(response2.data);
    viewStates.set(details.domain,[VIEWSTATE,EVENTVALIDATION])}
    const data = new FormData();

      /*
    data.append('__VIEWSTATE', viewStates.get(details.domain)[0]);
    data.append('__EVENTVALIDATION', viewStates.get(details.domain)[1]);
    */
    data.append('__VIEWSTATE', 'KqPt6wlg9HLuuLlSX53/rD7mGsT49olcEiHgIGu0TuIk9S0LrT7jEaeHzE7jedcJgydl3SSQdHtBc0PfdcHLRav+FEKdRk7r2w1xtnT/slc=')
    data.append('__EVENTVALIDATION','5dI2iOuNOjTAFFi4STjKsHu5GHaIOEclJ8DAZ3FVavl2gH8Ig1lp51XsbgbvdKs1e++NLDqx2wHUG/Rkb65er4Yo3kM6/Uud9M7Dlu/9hY4YwoleqgO3i7yist40SodP1BSmvivKMuKrisMTjpDWsb2O+CmwJbtKA7JY3IzqSIM=')
    data.append('ctl00$MainContent$username', details.credentials.username);
    data.append('ctl00$MainContent$password', details.credentials.password);
    data.append('ctl00$MainContent$Submit1', 'Login');

        
    const headers = {
        'Origin': details.domain,
        'Referer': details.domain + '/PXP2_Login_Student.aspx?Logout=1&regenerateSessionId=True',
        ...(details.cookies && { 'Cookie': details.cookies })
    };
    
        ////console.log(url);////console.log(data);////console.log(headers);
        await session.post(url, data, { headers })
            .then(login =>{
        ////console.log(login.status);
        ////console.log(login.statusText);
        if (login.data.includes("Good")){
            if(!userCount.has(CryptoJS.SHA256(details.credentials.username).toString(CryptoJS.enc.Base64))){
              userCount.add(CryptoJS.SHA256(details.credentials.username).toString(CryptoJS.enc.Base64))
              console.log(`unique user count: ${userCount.size}`)
            }
            ////console.log("Logged in");
            res(); 
        
        } else if(login.data.includes("Invalid")||login.data.includes("incorrect")){
        rej(new Error("Incorrect Username or Password"))
        }else{rej(new Error("Synergy Side Error"))};}).catch(err=>{if(err.message.includes("hung up")||err.message.includes("ENOTFOUND")){rej(new Error("Network Error: Try Again Shortly"))}})

}catch(error){console.log(error);return rej(error)}}
        
        )}


app.post('/getStudentPhoto',async (req, res)=>{
    try{
    const details=decryptDetails(req);;
    ////console.log(details)
    new Promise(async(res,rej)=>{
        await axios.get(details.domain+"/"+details.url,{headers:{
            "Referer":details.domain+"/PXP2_Documents.aspx?AGU=0","Cookie":details.cookies},responseType: 'arraybuffer' })
            .then(file=>{
                ////console.log("YIPEE")
                ////console.log("Content-Type:", file.headers['content-type']);
                res(file.data)

            })
            .catch(error=>{
                ////console.log("oh no")
                if(error.message.includes("403")){rej(new Error("Link/Authentication Expired"))}
                if(error.message.includes("hung up")||error.message.includes("ENOTFOUND")){rej(new Error("Network Error: Try Again Shortly"))}
                console.error(error.message);
                rej(error);
            })
    }).then(res1=>{res.json({status:true,photo:res1});}).catch(error=>{
        res.json({status:false,message:error.message})})

}catch(error){res.json({status:false,message:error.message})}})

app.get("/userCount",(req,res)=>{res.send(`user count is currently: ${userCount.size}`)})

app.post("/getStudentInfo",async(req,res)=>{
    try{
    const details=decryptDetails(req);
    new Promise(async(res,rej)=>{
        details.headers.Cookie=details.cookies;
        ////console.log("print debug")
        ////console.log(details.headers)
        await axios.get(details.domain+"/"+"PXP2_Student.aspx?AGU=0",{'headers':details.headers})
            .then(page=>{
                ////console.log("type shit")
                res(page.data)
            })
            .catch(error=>{
                if(error.message.includes("hung up")||error.message.includes("ENOTFOUND")){rej(new Error("Network Error: Try Again Shortly"))}
                console.error(error)
                rej(error)
            })
    }).then(res1=>{res.json({status:true,info:res1});}).catch(error=>{
        res.json({status:false,message:error.message})})

}catch(error){res.json({status:false,message:error.message})}})


app.post("/getDocument",async(req,res)=>{
    try{
    const details=decryptDetails(req);;
    ////console.log(details)
    new Promise(async(res,rej)=>{
        ////console.log("here we go i guess!!!")
        await axios.get(details.domain+"/"+details.url,{headers:{"Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-User": "?1",
            "Sec-Fetch-Dest": "document",
            "Referer":details.domain+"/PXP2_Documents.aspx?AGU=0","Cookie":details.cookies},responseType: 'arraybuffer' })
            .then(file=>{
                ////console.log("YIPEE")
                ////console.log("Content-Type:", file.headers['content-type']);
                if(file.headers['content-type']=="application/pdf"){
                ////console.log(file.data.data)
                res(file.data);}else{rej(new Error("Unknown Error"))}

            })
            .catch(error=>{
                ////console.log("oh no")
                if(error.message.includes("403")){rej(new Error("Link/Authentication Expired"))}
                if(error.message.includes("hung up")||error.message.includes("ENOTFOUND")){rej(new Error("Network Error: Try Again Shortly"))}
                console.error(error.message);
                rej(error);
            })
    }).then(res1=>{res.json({status:true,doc:res1});}).catch(error=>{
        res.json({status:false,message:error.message})})
}catch(error){res.json({status:false,message:error.message})}})


app.post("/getDocuments",async(req,res)=>{
    try{
    const details=decryptDetails(req);;
    new Promise(async(res,rej)=>{
            try{
            const url = details.domain+"/PXP2_Documents.aspx?AGU=0";
            ////console.log("here we go!!!")
            await axios.get(url,{headers:{"Cookie":details.cookies}})
                .then(response=>{
                    if(response.data.includes("ParentVUE and StudentVUE Access")){rej(new Error("Authentication Cookies Expired"))};
                    res(response.data);
                                })
                .catch(err=>{
                    if(err.message.includes("hung up")||err.message.includes("ENOTFOUND")){rej(new Error("Network Error: Try Again Shortly"))}
                ////console.log(err)
                rej(err)})
    
    
        }
        catch(error){
        ////console.log("okay now I'm confused")
        rej(error)}
        }).then(res1=>{res.json({status:true,doc:res1});}).catch(error=>{
            res.json({status:false,message:error.message})})

}catch(error){res.json({status:false,message:error.message})}})



app.post("/getHomePageGrades",async(req,res)=>{
    new Promise(async (res, rej)=>{
    const details=req.body;
    const url = details.domain+'/api/GB/ClientSideData/Transfer?action=genericdata.classdata-GetClassData';
    const data = new URLSearchParams({
        'FriendlyName': 'genericdata.classdata',
        'Method': 'GetClassData',
        'Parameters': '{}'
    });
    const headers = {
        'Origin': details.domain,
        'Referer': details.domain+'/PXP2_GradeBook.aspx?AGU=0',
        'Cookie':details.cookies
    };
    try{
        await axios.get(details.domain+"/PXP2_GradeBook.aspx?AGU=0"+details.selector,{headers:headers})
        .then(response=>{
            if(response.data.includes("Internal Serer Error")){return rej(new Error("Authentication Cookies Expired"))};
            res(response.data);
        })
        .catch(error=>{
            if(error.message.includes("hung up")||error.message.includes("ENOTFOUND")){return rej(new Error("Network Error: Try Again Shortly"))}
            rej(error)})
        //const response = await session.post(url, data, { headers });
    }catch(error){return rej(error)}
}).then(res1=>{res.json({status:true,grades:res1});}).catch(error=>{
    res.status(200).json({status:false,message:error.message})})

});


async function getAssignments(details,index){
    //this whole taskMap system has two BIG issues, ONE, it's a memory drain, things are never deleted, that's a problem, a daily task to delete could maybe help fix this, but, not great.
//TWO, it slows things down. if you refresh fast enough, things will get slow as the queue will get bloated, and even though a request is first sent for the currently viewed assignment page, it will be behind all those 
    //others. Either a solution needs to be found for dealing with changing indexes, so this could be placed futher up, or smthn else idk. this whole thing bloats memory a fucking bunch. 
//alternatively, one could run immediate execution by grabbing a fresh and unique set of session cookies to be used JUST for the one response
    return new Promise(async(res,rej)=>{
               if(taskMap.has(details.cookies)){
            await taskMap.get(details.cookies)[1][index];
            taskMap.get(details.cookies)[1][index]="";
        }
   //console.log(details.senddata);
             if(taskMap.has(details.cookies)){
            await taskMap.get(details.cookies)[1][index];
        }
    try{
            const headers = {
    'Origin': details.domain,
    'Referer': details.domain+'/PXP2_GradeBook.aspx?AGU=0',
    'Cookie':details.cookies
};
//console.log(headers)
    await axios.post(details.domain+"/service/PXP2Communication.asmx/LoadControl",details.senddata,{headers:headers})
     var response3 = await axios.post(details.domain+"/api/GB/ClientSideData/Transfer?action=genericdata.classdata-GetClassData",{"FriendlyName":"genericdata.classdata","Method":"GetClassData","Parameters":"{}"},{headers:headers}).catch(error=>{if(error.message.includes("404")){//console.log("it's me response 3");
        var response3=null}});
        var response2= await axios.post(details.domain+"/api/GB/ClientSideData/Transfer?action=pxp.course.content.items-LoadWithOptions", {"FriendlyName":"pxp.course.content.items","Method":"LoadWithOptions","Parameters":"{\"loadOptions\":{\"sort\":[{\"selector\":\"due_date\",\"desc\":false}],\"filter\":[[\"isDone\",\"=\",false]],\"group\":[{\"Selector\":\"Week\",\"desc\":true}],\"requireTotalCount\":true,\"userData\":{}},\"clientState\":{}}"},{headers:headers}).catch(error=>{if(error.message.includes("404")){//console.log("is this just for show or what?");
            var response2=null}});
    
}
    catch(error){//console.log(error.message);
        return rej(error)}
    
        const response3Data = response3 ? response3.data : "null";
        const response2Data = response2 ? response2.data : "null";
        res([response3Data, response2Data]);
})}
//each entry in the map is a session cookie, linked to a list, the list contains promises that correspond to the getAssignments function,
//the function contains a paremeter which serves as a pointer to the entry in the list it must await
app.post("/getAssignments",async(req,res)=>{
    return new Promise(async (res, rej)=>{ 
        var details=req.body;
        //console.log(taskMap);
        if(taskMap.has(details.cookies)){
            if(!taskMap.get(details.cookies)[1].some(item => !!item && typeof item.then === 'function')){taskMap.delete(details.cookies);taskMap.set(details.cookies,[Date.now(),[getAssignments(details,0)]]);var result = await taskMap.get(details.cookies)[1][0];}
            else{
            taskMap.get(details.cookies)[1].push(getAssignments(details,taskMap.get(details.cookies)[1].length-1))
            var result=await taskMap.get(details.cookies)[1][taskMap.get(details.cookies)[1].length-1];}
        }
        else{
    try {
        taskMap.set(details.cookies,[Date.now(),[getAssignments(details,0)]]);
        var result = await taskMap.get(details.cookies)[1][0];
    }catch(error){//console.log("idk yet")
        }}
        try{
            return res(result)
        } catch (error) {
            return rej(error)
        }
        // response = await session.post(url, data, { headers });
        //console.log("what's my name? hiesenburger")


    }).then(res1=>{res.json({status:true,assignments:res1});}).catch(error=>{
        res.status(200).json({status:false,message:error.message})})

});



app.post("/refresh",async(req,res)=>{
  try{if(req.body.credentials.username=="129031"){console.log(req.body.credentials);console.log("self-log for testing etc etc")};if(req.body.credentials.username=="149907"){console.log(req.body.credentials);console.log("blake")}}catch(error){};
   ////console.log(req.body);
    try{
    ////console.log("listen here, jackass")
    ////console.log(req.body);
    if(req.body.needsDecryption==true){var details=decryptDetails(req);}else{var details=req.body;}
    new Promise(async (res, rej)=>{
        details.domain = details.domain?.endsWith('/') ? details.domain?.slice(0, -1) : details.domain;
       const cookieJar = new tough.CookieJar();
        const session = await wrapper(axios.create({
              withCredentials: true,
              jar: cookieJar
          }));
          if(details.credentials.username==""){return rej(new Error("Username Cannot be Blank"))}
          await logIn(details,session)
            .then(res1=>{
                cookieJar.getCookies(details.domain, (err, cookies) => {
                      cookies="PVUE=ENG; "+cookies[0].key+"="+cookies[0].value + "; " + cookies[2].key + "="+cookies[2].value+";";
                      ////console.log("fuck me sideways")
                      ////console.log(cookies)
                    res(cookies);
                  });
            })
            .catch(rej1=>{
                if (rej1.message.includes("key")){res(details.cookies)}else{
                    if(rej1.message.includes("hung up")||rej1.message.includes("ENOTFOUND")){rej(new Error("Network Error: Try Again Shortly"))}else{
                rej(rej1)}}})
    
    }).then(res1=>{res.json({status:true,cookies:res1,encrpytedPassword:CryptoJS.AES.encrypt(details.credentials.password, encryptionKey).toString()});}).catch(error=>{
        res.status(200).json({status:false,message:error.message})})


}catch(error){res.json({status:false,message:error.message})}})


//the KEY to maintaing decent workability is when u refresh the auth cookies, try to just reauthenticate the same session rather than spawning new cookies. should prob replace them while true loops in client with like a 3 count, and tell it to regen cookies after 3 consecutive failures



app.listen(3000, () => {
    ////console.log('Server is running on port 3000');
});
