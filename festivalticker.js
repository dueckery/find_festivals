const puppeteer = require('puppeteer');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
var admin = require("firebase-admin");

var serviceAccount = require("./firebase.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://findleadsforzybbee.firebaseio.com"
});

const db = admin.firestore();

const BASE_URL = 'https://www.festivalticker.de/';
const PAGES = [
  'festivals-januar',
  'festivals-februar',
  'festivals-maerz',
  'festivals-april', 
  'festivals-mai', 
  'festivals-juni',
  'festivals-juli', 
  'festivals-august', 
  'festivals-september', 
  'festivals-oktober', 
  'festivals-november',
  'festivals-dezember'
];


const records = [];

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  try {
    // Go through every month
  for (let i = 0; i < PAGES.length; i++) {
    
    const csvWriter = createCsvWriter({
      path: `${PAGES[i]}.csv`,
      header: [
          { id: 'name', title: 'NAME' },
          { id: 'country', title: 'COUNTRY' },
          { id: 'emails', title: 'EMAILS' },
          { id: 'website', title: 'WEBSITE' }
      ]
    });

    // Visit the Month Page
    const url = BASE_URL + PAGES[i];
    await page.goto(url);
    console.log(url);

    // Get all Names and URL for Festivals
    const festivals = await page.evaluate(() => {
      const anchors_node_list = document.getElementsByClassName('url summary');
      const anchors = [...anchors_node_list];
      return anchors.map(el => {
        return {
          name: el.innerText,
          url: el.href
        }
      });
    });

    // Go to every Festival Sub Page
    for (festival of festivals) {
      // Goto Festival
      const url = festival.url;
      await page.goto(url);
      // Get the Country
      const country = await page.evaluate(() => {
        const anchors_node_list = document.getElementsByClassName('country-name');
        const anchors = [...anchors_node_list];
        return anchors[0].innerHTML;
      });
      // If it's German, Austrian or Switzerland => proceed
      if (country === 'Deutschland' || country === 'Schweiz' || country === 'Oesterreich') {
        
        try {
          // Go to their Website
          const festivalUrl = await page.evaluate((selector) => {
            return document.querySelector(selector).href;
          }, '#content_container > div.float.sl > table > tbody > tr > td:nth-child(1) > table > tbody > tr:nth-child(1) > td > table:nth-of-type(2) > tbody > tr:nth-child(1) > td:nth-child(2) > a');
      
          // If Url is Facebook => go to next page
          if (festivalUrl.includes('facebook')) continue;
          
          // 1. try impressum subpage
          await page.goto(`${festivalUrl}impressum`);
          console.log(`${festivalUrl}impressum`);
          const emailsImpressum = await findEmailsOnPage(page);

          // 2. try imprint subpage
          await page.goto(`${festivalUrl}imprint`);
          console.log(`${festivalUrl}imprint`);
          const emailsImprint = await findEmailsOnPage(page);

          // 3. try kontakt subpage
          await page.goto(`${festivalUrl}kontakt`);
          console.log(`${festivalUrl}kontakt`);
          const emailsKontakt = await findEmailsOnPage(page);

          // 4. try contact subpage
          await page.goto(`${festivalUrl}contact`);
          console.log(`${festivalUrl}contact`);
          const emailsContact = await findEmailsOnPage(page);

          // 5. Search Main Page for Email
          await page.goto(`${festivalUrl}`);
          console.log(`${festivalUrl}`);
          const emailsMain = await findEmailsOnPage(page);
    
          // 6. Search Main Page for Impressum Button
          await page.goto(`${festivalUrl}`);

          let emails = new Set(emailsImpressum.concat(emailsImprint)
            .concat(emailsKontakt)
            .concat(emailsContact)
            .concat(emailsMain));

          const emailsString = [...emails].join(', ');
          const record = {
            name: festival.name, 
            country: country, 
            emails: emailsString, 
            website: festivalUrl
          };

          records.push(record);

          save(record);

          console.log(`${record.name} gespeichert!`);

        } catch (err) {

          console.log(err);

        }
      }
    }

    console.log(records);

    csvWriter.writeRecords(records)
        .then(() => console.log('...Done'))
        .catch(err => console.log(err));
  }
  
  await browser.close();  
  
  } catch (err) {
    console.log(err);
  }

})();

async function findEmailsOnPage(page) {
  try {

    let elements = await page.evaluate((selector) => {
      let elements = Array.from(document.querySelectorAll(selector));
      let links = elements.map(element => {
        return element.innerHTML
      })
      return links;
    }, 'body');
  
    for (element of elements) {
      // Real Email
      let emails = element.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi);
      if (!emails) return [];
      else return emails;
    }

  } catch (err) {
    console.log(err);
  }
};

function save(record) {
  const docRef = db.collection('leads').add({
    name: record.name,
    country: record.country,
    emails: record.emails,
    website: record.website
  });
  
}

async function findPage(page) {

  const emails = [];

  try {

    await page.$x("//a[contains(text(), 'Impressum')]");
    const impressumMail = await findEmailsOnPage(page);
    console.log('IMPRESSUM');
    await page.$x("//a[contains(text(), 'Imprint')]");
    const imprintMail = await findEmailsOnPage(page);
    console.log('IMPRINT');
    await page.$x("//a[contains(text(), 'Kontakt')]");
    const kontaktMail = await findEmailsOnPage(page);
    console.log('KONTAKT');
    await page.$x("//a[contains(text(), 'Contact')]");
    const contactMail = await findEmailsOnPage(page);
    console.log('CONTACT');

    emails.concat(impressumMail).concat(imprintMail).concat(kontaktMail).concat(contactMail);

    return emails;

  } catch (err) {

    console.log(err);

  }
};