const cheerio = require('cheerio');
const request = require('async-request');
const csv = require('csvtojson');
const jsonfile = require('jsonfile');

const liniiUrbaneUrl = 'http://ctpcj.ro/index.php/ro/orare-linii/linii-urbane';
const liniiMetropolitaneUrl = 'http://ctpcj.ro/index.php/ro/orare-linii/linii-metropolitane';
const liniiSuperMarketUrl = 'http://ctpcj.ro/index.php/ro/orare-linii/linii-supermarket';
const csvBaseUrl = 'http://ctpcj.ro/orare/csv/orar_';
const jsonFileBasic = 'static/buses_basic.json';
const jsonFileDetail = 'static/buses_detail.json';
const filterList = ['route_long_name', 'service_name'];

async function scrap(data, additionalData) {
    try {
        $ = cheerio.load(data);
        const lines = [];
        $('#portfolio').find('.tz_item').each(function () {
            const availableTypes = ['tramvaie', 'autobuze', 'microbuze', 'troleibuze'];
            let type;
            availableTypes.forEach(item => {
                if ($(this).hasClass(item)) {
                    type = item;
                }
            });

            const lineItem = {
                name: $(this).find('.tz-inner .tz-des h6 a').text().trim().substring(6).replace(" ", ""),
                // url: $(this).find('h6 a').attr('href').trim(),
                type: type,
                route: $(this).find('.tz-inner .tz-des .ruta').text().trim(),
            };
            lines.push(Object.assign(lineItem, additionalData));
        });

        return lines.reverse();
    } catch (e) {
        throw e;
    }
}

async function loadPage(url) {
    return request(url, {
        headers: {
            host: 'ctpcj.ro',
            Referer: 'http://ctpcj.ro/index.php/ro/orare-linii/linii-urbane/linia1'
        },
    }).then(resp => {
        if (resp.statusCode !== 200) {
            throw `Could not load ${url}`;
        }
        return resp;
    });
}

async function csvToJson(csvData) {
    const jsonObject = {};
    const lines = [];
    let i = 0;

    if (!csvData) {
        return;
    }

    return new Promise((resolve) => {
        csv({
            noheader: true,
            flatKeys: true,
            headers: [1, 2]
        }).fromString(csvData)
            .on('csv', (csvRow) => {
                if (i < 5) {
                    jsonObject[csvRow[0]] = csvRow[1];
                } else {
                    lines.push(csvRow);
                }
                i++;
            })
            .on('done', () => {
                jsonObject.lines = lines;
                resolve(jsonObject);
            })
    });
}

async function filterLines(lines, filterList) {
    filterList.map(filter => {
        delete lines[filter]
    });
    return lines;
}

async function scrapOneLine(lineName) {
    return Promise.all([
        loadPage(csvBaseUrl + lineName + '_lv.csv').then(html => csvToJson(html.body).then(json => filterLines(json, filterList))).catch(e => console.error(e)),
        loadPage(csvBaseUrl + lineName + '_s.csv').then(html => csvToJson(html.body).then(json => filterLines(json, filterList))).catch(e => console.error(e)),
        loadPage(csvBaseUrl + lineName + '_d.csv').then(html => csvToJson(html.body).then(json => filterLines(json, filterList))).catch(e => console.error(e))
    ]);
}

async function scrapAll() {
    let scraperResponse;

    const [urbane, metropolitane, market]  = await Promise.all([
        loadPage(liniiUrbaneUrl).then(html => scrap(html.body)).catch(e => console.error(e)),
        loadPage(liniiMetropolitaneUrl).then(html => scrap(html.body)).catch(e => console.error(e)),
        loadPage(liniiSuperMarketUrl).then(html => scrap(html.body)).catch(e => console.error(e))
    ]);

    market.map(line => {
        line.name = line.name.toLowerCase();
    });

    scraperResponse = {urbane, metropolitane, market};

    jsonfile.writeFile(jsonFileBasic, scraperResponse);

    for (const [key1, lines] of Object.entries(scraperResponse)) {
        for (const [key2, line] of lines.entries()) {

            const [lv, s, d] = await scrapOneLine(line.name);

            scraperResponse[key1][key2].station = {lv, s, d};
            jsonfile.writeFile('static/' + line.name + '.json', scraperResponse[key1][key2], (err) => {
                if (err) {
                    console.error(err);
                }
            })
        }
    }

    jsonfile.writeFile(jsonFileDetail, scraperResponse, (err) => {
        if (err) {
            console.error(err);
        }
    });

    return scraperResponse;
}

scrapAll();