process.version
const GroupCrawler = require("./groupCrawler.js"); 

const operationFlag = process.argv[2]; 

switch(operationFlag){
    case "-NewJoined":
        if(process.argv.length !== 5){
            console.log("invalid params.")
            break; 
        }
        GroupCrawler({userName: process.argv[3], password: process.argv[4]});
        break;
    default: 
        console.log("unknown request");
        console.log("Options:");
        console.log("-NewJoined <userName> <password>")
}