/**
 * SEO Checker
 * Copyright (c) 2014 - 2015 Clever Labs / MIT Licensed
 * A library to do some basic SEO checks.
 */

// Set up requires
var cheerio = require('cheerio'),
    request = require('request'),
    Crawler = require('simplecrawler'),
    density = require('density');

var checkStuffing = function (string, cutOff) {
    var cleanString = string.replace(/[\.,-\/#!$%\^&\*;:{}=\-_`~()]/g, ""),
        words = cleanString.split(' '),
        frequencies = {},
        word, frequency, i,
        isStuffed = false;

    for (i = 0; i < words.length; i++) {
        word = words[i];
        frequencies[word] = frequencies[word] || 0;
        frequencies[word] ++;
        if (frequencies[word] == 3) {
            isStuffed = true;
            break;
        }
    }

    return isStuffed;
}

module.exports = {
    /**
     * Load HTML for a single URL
     *
     * Use this to fetch the contents of a single URL then
     * pass the result to the `meta` function or any other
     * code that can parse or transform the response body of
     * an HTTP request.
     *
     * `url` [String] - URL of page to read
     * `callback` [Function] - Function to call on completion
     *
     * Returns the response body of an HTTP request as a string
     */
    load: function (url, callback) {
        // Check if user input protocol
        if (url.indexOf('http://') < 0 && url.indexOf('https://') < 0) { // TODO: Turn this into its own function
            url = 'http://' + url;
        }

        // Make request and fire callback
        request.get(url.toLowerCase(), function (error, response, body) {
            if (!error && response.statusCode === 200) {
                return callback(body);
            }

            return callback(false);
        });
    },

    /**
     * Parse meta data from an HTTP response body
     *
     * `body` [String] - The HTML of a web page to parse
     *
     * Returns an object containing data related to the SEO
     * signals of the page that was parsed. Pass the result to
     * another function to determine an "SEO score".
     */
    meta: function (url, body) {
        var $ = cheerio.load(body),
            page = {};

        // Meta signals
        page.title = $('title').text() || null;
        page.excessiveTitle = page.title ? page.title.length > 70 : null;
        page.description = $('meta[name=description]').attr('content') || null;
        page.excessiveDesc = page.description ? page.description.length > 155 : null;
        page.author = $('meta[name=author]').attr('content') || null;
        page.keywords = $('meta[name=keywords]').attr('content') || null;

        // H1 Checks
        page.h1stuffing = false;
        page.noH1Tags = true;
        var h1s = 0;
        $('h1').each(function (key, value) {
            page.noH1Tags = false;
            if (checkStuffing($(value).text())) {
                page.h1stuffing = true;
                return false;
            }
            h1s++;
        });

        // H1 Checks
        page.h1stuffing = false;
        page.noH1Tags = true;
        var h1s = 0;
        $('h1').each(function (key, value) {
            page.noH1Tags = false;
            if (checkStuffing($(value).text())) {
                page.h1stuffing = true;
                return false;
            }
            h1s++;
        });

        // H2 Checks
        page.h2stuffing = false;
        page.noH2Tags = true;
        var h2s = 0;
        $('h2').each(function (key, value) {
            page.noH2Tags = false;
            if (checkStuffing($(value).text())) {
                page.h2stuffing = true;
                return false;
            }
            h2s++;
        });

        // Image Alt Tags Checking Existence
        var totalImgs = 0,
            accessibleImgs = 0;
        $('img').each(function (index) {
            totalImgs++;
            if ($(this).attr('alt')) {
                accessibleImgs++;
            }
        });
        page.altTagsPresent = accessibleImgs === totalImgs;

        // Total Outgoing Links
        var localHost = url.indexOf("://") > -1 ? url.split("://")[1] : url;
        localHost = new RegExp(localHost);

        var uniqueExtLinks = [];
        var uniqueIntLinks = [];
        $('a').each(function () {
            // Store current link's url
            var currentLink = $(this).attr("href");
            if (currentLink && currentLink.lastIndexOf('/') == currentLink.length - 1)
                currentLink = currentLink.substring(0, currentLink.length - 1);

            // Test if current host (domain) is in it
            if (localHost.test(currentLink) || currentLink == "/") {
                // It is an internal Link
                if (currentLink.indexOf("http") > -1 && uniqueIntLinks.indexOf(currentLink) == -1)
                    uniqueIntLinks.push(currentLink);
            } else if (currentLink && currentLink.slice(0, 1) == "#") {
                // It's an anchor link
                // console.log("Anchor Link");
            } else {
                // a link that does not contain the current host
                if (currentLink && uniqueExtLinks.indexOf(currentLink) == -1) {
                    uniqueExtLinks.push(currentLink);
                }
            }
        });
        page.externalLinks = uniqueExtLinks.length;
        page.internalLinks = uniqueIntLinks.length;

        // Checking If Analytics Script Tags Exist or not
        var strsToCheck = [
            "ga.js", "gtm.js", "analytics.js", "dc.js", "gas.js"
        ];
        page.analyticsEnabled = false;
        $('script').each(function () {

            var src = $(this).attr('src');
            if (src) {
                for (var i = 0; i < strsToCheck.length; i++) {
                    if (src.indexOf(strsToCheck[i]) > -1) {
                        console.log(src);
                        page.analyticsEnabled = true;
                    }
                }
            }
        });

        // Calculate Keyword Density
        var keywordDensity = density(body).getDensity();
        keywordDensity = keywordDensity.slice(0, 10);
        for (key in keywordDensity) {
            if (page.title.indexOf(keywordDensity[key].word) > -1)
                keywordDensity[key].inTitle = true;
            else
                keywordDensity[key].inTitle = false;

            if (page.description.indexOf(keywordDensity[key].word) > -1)
                keywordDensity[key].inDesc = true;
            else
                keywordDensity[key].inDesc = false;
        }
        page.keywordDensity = keywordDensity;

        // Checking if Page contains Open Graph Meta Tags
        var ogMetaTags = $("meta[property*='og:']").length;
        page.ogTagsPresent = ogMetaTags > 0 ? true : false;

        return page;
    },

    /**
     * Generate SEO data for multiple pages of a site at once
     *
     * `url` [String] - The URL to begin the crawl
     * `options` [Object] - Options to pass to the crawler. Uses a subset of the `simplecrawler` lib's options:
     *  - `maxPages` [Number] - The max number of pages to crawl (defaults to 10)
     *  - `interval` [Number] - Delay between each request for a new page
     *  - `maxDepth` [Number] - Depth of crawl. See simplecrawler docs for an explanation
     *  - `maxConcurrency` [Number] - Number of processes to spawn at a time
     *  - `timeout` [Number] - Time to wait for a server response before moving on
     *  - `downloadUnsupported` [Boolean] - Determines whether crawler downloads files it cannot parse
     *  - `userAgent` [String] - The UA string to send with requests
     *  - `htmlOnly` [Boolean] - Tells crawler not to crawl any non-HTML text/html pages. This is a required option and has no default
     *
     * Returns an array of objects containing SEO data and URL. Example return value:
     *
     *    [{
     *      url: 'http://example.com/page1.html',
     *      results: { <results object identical to signature of this.meta()'s return value> }
     *    }]
     */
    crawl: function (url, options, callback) {
        var crawler = Crawler.crawl(url.toLowerCase()),
            opts = options || {},
            maxPages = opts.maxPages || 10,
            parsedPages = [], // Store parsed pages in this array
            seoParser = this.meta, // Reference to `meta` method to call during crawl
            crawlResults = []; // Store results in this array and then return it to caller

        // Crawler settings
        crawler.interval = opts.interval || 250; // Time between spooling up new requests
        crawler.maxDepth = opts.depth || 2; // Maximum deptch of crawl
        crawler.maxConcurrency = opts.concurrency || 2; // Number of processes to spawn at a time
        crawler.timeout = opts.timeout || 1000; // Milliseconds to wait for server to send headers
        crawler.downloadUnsupported = opts.unsupported || false; // Save resources by only downloading files Simple Crawler can parse
        // The user agent string to provide - Be cool and don't trick people
        crawler.userAgent = opts.useragent || 'SEO Checker v1 (https://github.com/Clever-Labs/seo-checker)';

        // Only fetch HTML! You should always set this option unless you have a good reason not to
        if (opts.htmlOnly === true) { // Being explicit about truthy values here
            var htmlCondition = crawler.addFetchCondition(function (parsedURL) {
                return !parsedURL.path.match(/\.jpg|jpeg|png|gif|js|txt|css|pdf$/i);
            });
        }

        crawler.on('fetchcomplete', function (queueItem, responseBuffer, response) {
            if (queueItem.stateData.code === 200) {
                crawlResults.push({
                    url: queueItem.url,
                    body: responseBuffer.toString()
                });
            }
            if (crawlResults.length >= maxPages) {
                this.stop(); // Stop the crawler
                crawlResults.forEach(function (page, index, results) {
                    parsedPages.push({
                        url: page.url,
                        results: seoParser(page.body)
                    });
                });
                if (!callback) {
                    return parsedPages;
                } else {
                    callback(parsedPages);
                }
            }
        });
    }
};
