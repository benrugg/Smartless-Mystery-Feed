const express = require("express")
const axios = require("axios")
const parser = require("rss-parser")
const RSS = require("rss")
const moment = require("moment")

const app = express()
const port = process.env.PORT || 3000

const SMARTLESS_RSS_URL = "https://feeds.simplecast.com/hNaFxXpO"
const MODIFIED_URL = "https://smartless-mystery-feed.vercel.app/"

// Endpoint to return the modified RSS feed
app.get("/", async (req, res) => {
  try {
    // Step 1: Fetch the original RSS feed
    const originalFeed = await fetchPodcastFeed(SMARTLESS_RSS_URL)

    // Step 2: Modify the titles to hide the guest names
    const modifiedFeed = modifyFeedTitles(originalFeed)

    // Step 3: Send the new RSS feed as the response with the correct content type
    res.set("Cache-Control", "max-age=3600")
    res.set("Content-Type", "application/xml")
    res.send(modifiedFeed)
  } catch (error) {
    console.error("Error fetching or generating the RSS feed:", error)
    res.status(500).send("Internal Server Error")
  }
})

// Function to fetch the original RSS feed
async function fetchPodcastFeed(url) {
  const response = await axios.get(url)
  const rssParser = new parser()
  const feed = await rssParser.parseString(response.data)
  return feed
}

// Function to modify the feed titles
function modifyFeedTitles(feed) {
  let keywords = feed.itunes?.keywords || []
  if (!Array.isArray(keywords)) keywords = [keywords]
  keywords = keywords.join(", ")

  const modifiedFeed = new RSS({
    title: feed.title,
    description: feed.description,
    feed_url: MODIFIED_URL,
    site_url: MODIFIED_URL,
    copyright: feed.copyright,
    language: feed.language,
    pubDate: feed.pubDate,
    image_url: feed.image?.url,
    ttl: 60,
    custom_namespaces: {
      atom: "http://www.w3.org/2005/Atom",
      content: "http://purl.org/rss/1.0/modules/content/",
      googleplay: "http://www.google.com/schemas/play-podcasts/1.0",
      itunes: "http://www.itunes.com/dtds/podcast-1.0.dtd",
      media: "http://search.yahoo.com/mrss/",
      podcast: "https://podcastindex.org/namespace/1.0",
    },
    custom_elements: [
      {
        "itunes:image": {
          _attr: {
            href: feed.image?.url,
          },
        },
      },
      { "itunes:explicit": feed.itunes?.explicit },
      { "itunes:keywords": keywords },
      { "itunes:owner": [{ "itunes:name": feed.itunes?.owner?.name }] },
      { "itunes:author": feed.itunes?.author },
      { "itunes:type": feed.itunes?.type },
      { "itunes:summary": feed.itunes?.summary },
    ],
  })

  feed.items.forEach((item) => {
    // Extract the original title, and trim quotes
    const originalTitle = item.title.replace(/^["“]|["”]$/g, "")
    const formattedDate = moment(item.pubDate).format("MMM D, YYYY")
    let newTitle

    // Prepare regex patterns
    const livePattern = /(.+) LIVE in (.+)/i

    // Rule 1: If title contains "[anything] LIVE in [location]"
    if (livePattern.test(originalTitle)) {
      const match = originalTitle.match(livePattern)
      const location = match[2]
      newTitle = `Mystery Guest LIVE in ${location} / ${formattedDate}`
    }
    // Rule 2: If title has two words, "&", and two more words (e.g., "Will Arnett & Jason Bateman")
    else if (isTwoGuestsTitle(originalTitle)) {
      newTitle = `TWO Mystery Guests / ${formattedDate}`
    }
    // Rule 3: If title has 1-3 words, format like "Mystery Guest on [date]"
    else if (isOneToThreeWordsTitle(originalTitle)) {
      newTitle = `Mystery Guest / ${formattedDate}`
    }
    // Rule 4: Default to "Something Special on [date]"
    else {
      newTitle = `Something Special / ${formattedDate}`
    }

    // Prepend the description text and add two line breaks
    const newDescription = `View the description to see who the mystery guest is. But if you don't want to know, don't look here...\n\n${item.contentSnippet}`

    modifiedFeed.item({
      title: newTitle,
      description: newDescription,
      url: item.link,
      guid: item.guid,
      date: item.pubDate,
      enclosure: item.enclosure
        ? {
            url: item.enclosure.url,
            type: item.enclosure.type,
            size: item.enclosure.length,
          }
        : undefined,
      custom_elements: [
        { "itunes:image": item.itunes?.image },
        { "itunes:duration": item.itunes?.duration },
        { "itunes:explicit": item.itunes?.explicit },
        { "itunes:episodeType": item.itunes?.episodeType },
        { "itunes:episode": item.itunes?.episode },
      ],
    })
  })

  return modifiedFeed.xml({ indent: true })
}

// Helper function to check if the title has exactly two words, "&", then two more words
function isTwoGuestsTitle(title) {
  const words = title.split(" ")
  const ampersandIndex = words.indexOf("&")

  return (
    words.length === 5 &&
    ampersandIndex === 2 && // "&" must be the third word
    words[0] &&
    words[1] &&
    words[3] &&
    words[4] // Ensure there are two words before and after "&"
  )
}

// Helper function to check if the title has 1 to 3 words
function isOneToThreeWordsTitle(title) {
  const words = title.split(" ")
  return words.length >= 1 && words.length <= 3
}

// Start the Express server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`)
})
