const groupsListPage = "https://fetlife.com/groups";
const loginPage = "https://fetlife.com/users/sign_in";
const puppeteer = require('puppeteer');
const TacoFilter = require('./tacoFilterV2.js');
const jsdom = require("jsdom");
const fs = require('fs');
const _uniq = require("lodash.uniq");
const _flattendeep = require("lodash.flattendeep")
const _filter = require("lodash.filter")
const _map = require("lodash.map");
const { JSDOM } = jsdom;

class MemberScanner {
    constructor({ browser, page, credentials}) {
        this.browser = browser;
        this.page = page;
        this.credentials = credentials; 
    }

    getRenderedDomPageFromHtmlString({ htmlPageString, url }) {
        return new JSDOM(htmlPageString, {
            url: url,
            referrer: url
        });
    }

    async getRenderedPageDomFromUrl(url) {
       // await this.page.setRequestInterception(true);
        await this.page.goto(url);
        //await this.page.screenshot({path: 'page-screenshot.png'});
        const htmlPageString = await this.page.content();
        const pageAsDom = this.getRenderedDomPageFromHtmlString({ htmlPageString, url })
        return pageAsDom;
    }

    async UrlsOfGroupsToScan(usersGroupsDom) {
        const usersGroupUrlRoutes = Array.from(
            usersGroupsDom.window.document.getElementsByClassName("group_listings")[0].getElementsByClassName("group_listing")
        );

        const groupsToCheckUrl = _map(usersGroupUrlRoutes, group => {
            return `${group.href}/members`;
        });
        return groupsToCheckUrl
    }

    async findLatestMembersOfAGroupPage(membersPageUrl) {
        const listOfTacos = [];
        //const newPage = await this.browser.newPage();
        const firstMembersPageDom = await this.getRenderedPageDomFromUrl(membersPageUrl);

        //console.log(firstMembersPageDom.window.document.getElementsByClassName("link secondary underline-hover")[0].textContent);
        const groupPageName = firstMembersPageDom.window.document.getElementsByClassName("link secondary underline-hover")[0].textContent

        const paginationElement = firstMembersPageDom.window.document.getElementsByClassName("pagination")[0];
        const maxPages = Number(paginationElement.children[paginationElement.children.length - 2].firstChild.textContent);
        const lastTwoMemberPageUrls = [`${membersPageUrl}?page=${maxPages}`, `${membersPageUrl}?page=${maxPages - 1}`];

        for (let i = 0; i < lastTwoMemberPageUrls.length; i += 1) {
            const oneOfTheLastFewMemberPagesUrl = lastTwoMemberPageUrls[i];
            const oneOfTheLastFewMemberPagesDom = await this.getRenderedPageDomFromUrl(oneOfTheLastFewMemberPagesUrl);
            const members = oneOfTheLastFewMemberPagesDom.window.document.getElementsByClassName("relative flex-auto mw-100 mw-none-ns");
            const women = TacoFilter(members);
            listOfTacos.push(women);
        }

        return {
            group: groupPageName,
            members: _flattendeep(listOfTacos)
        };
    }

    async GetNewMembersFromAllGroups(groupsToCheckUrls) {
        const unfilteredNewMembersFromAllGroups = [];

        for (let i = 0; i < groupsToCheckUrls.length; i += 1) {
            const currentGroupUrl = groupsToCheckUrls[i];
            //await this.page.screenshot({path: `group-members-page-screenshot.png`});
            const GroupPageMembershipData = await this.findLatestMembersOfAGroupPage(currentGroupUrl);
            unfilteredNewMembersFromAllGroups.push(GroupPageMembershipData)
        }

        return unfilteredNewMembersFromAllGroups;
    }

    FilterFromPreviouslyFound(membersToFilter) {
        if (!fs.existsSync('./previouslyFound.json')) {
            fs.writeFileSync('./previouslyFound.json',`{"found":[]}`,'utf8'); 
          }

        const previouslyFound = JSON.parse(fs.readFileSync('./previouslyFound.json', 'utf8'));
        let activePeoplInGroup = _map(membersToFilter, groupListing => {
            groupListing.members = _filter(groupListing.members, member => {
                return !previouslyFound.found.includes(member);
            });
            return groupListing;
        });

        return _filter(activePeoplInGroup, group => {
            return group.members.length !== 0;
        });
    }

    AddFounUsersToPreviouslyFound(newActivePeople) {
        const previouslyFound = JSON.parse(fs.readFileSync('./previouslyFound.json', 'utf8'));
        previouslyFound.found = previouslyFound.found.concat(_flattendeep(_map(newActivePeople, 'members')));
        fs.writeFileSync('./previouslyFound.json', JSON.stringify(previouslyFound), 'utf8');
    }

    async LogIn({userName, password}) {
        await this.page.goto(loginPage);

        await this.page.waitForSelector(`[name="user[login]"`);
        await this.page.type(`[name="user[login]"`, userName);

        await this.page.keyboard.down("Tab");
        await this.page.keyboard.type(password);

        await this.page.evaluate(() => {
            const Buttons = document.getElementsByTagName("button");
            for (let i = 0; i < Buttons.length; i += 1) {
                const btn = Buttons[i];
                if (btn.innerText == "Login to FetLife") {
                    btn.click();
                }
            }
        });
        await this.page.waitForSelector(`[id="activity_feed_container"]`);
    }

    async ScanForUsers() {

        console.log("Logging in...")
        await this.LogIn(this.credentials)
        const listOfGroupsToScanDom = await this.getRenderedPageDomFromUrl(groupsListPage, this.page);
        let groupsToCheckUrls = await this.UrlsOfGroupsToScan(listOfGroupsToScanDom);

        console.log(`${groupsToCheckUrls.length} Groups to check...`);

        groupsToCheckUrls= ["https://fetlife.com/groups/18830/members"];

        const newMembersFromAllGroups = await this.GetNewMembersFromAllGroups(groupsToCheckUrls);
        const justListOfMembers = _map(newMembersFromAllGroups, 'members');
        const newMembers = _uniq(_flattendeep(justListOfMembers));

        console.log(`${newMembers.length} recenlty joined members...`);

        const newActiveMembers = this.FilterFromPreviouslyFound(newMembersFromAllGroups)

        let totalNew = 0;
        newActiveMembers.forEach(group => {
            totalNew += group.members.length;
        })

        console.log(`${totalNew} new unchecked members.`);

        this.AddFounUsersToPreviouslyFound(newActiveMembers);


        const fileOutputString = {
            newPeopleToLookAt: newActiveMembers
        };

        const currentTime = new Date(Date.now());
        fs.writeFileSync(`./ToCheckOut${currentTime.toISOString()}.json`, JSON.stringify(fileOutputString), 'utf8');

        await this.browser.close();
        console.log("Done!");
    }
}

module.exports = async (credentials) => {
    const browser = await puppeteer.launch({ devtools: false });
    const page = await browser.newPage();
    const scanner = new MemberScanner({ credentials, browser, page });

    await scanner.ScanForUsers();

}