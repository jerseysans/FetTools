
module.exports = (listOfMembers) =>{
    const isFemaleCheck = new RegExp('[0-99]M');
    const members = Array.from(listOfMembers); 
    const babesToCheckOut = []; 
    members.forEach(memberCard =>{
        var memberGenderId = memberCard.getElementsByClassName("f6 fw7 silver")[0]; 
        if(isFemaleCheck.exec(memberGenderId.textContent) === null) {
            babesToCheckOut.push(memberCard.firstElementChild.firstElementChild.href); 
        }
    });
    return babesToCheckOut; 
} 