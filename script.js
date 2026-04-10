 
// settings
 

const AUTOCOMPLETE_LIMIT = 5 // how many autocompletes will be sohwn
const CANDIDATE_PREFIX_LIMIT = 50 // check up to 50 matching words max (then we do fuzzy search)
const FUZZY_DISTANCE_THRESHOLD = 2 // max edits/mistakes allowed for search to be returned (jhn -> john is 1 edit, jhnn -> john is 2 edits))

 
// CSV LOADING
 

async function loadCSV() {
  let response = await fetch("movies_enriched.csv")
  let text = await response.text()

  parseCSV(text)
  buildTrie()
  buildIndex() // rebuilds index.json every time in case movies.csv changes
  populateStudioFilter()

  let allResults = sortResults([...movies], "name", "", "asc")
  render(allResults.slice(0, 100))

  console.log(movies.length, 'movies loaded and', Object.keys(index).length, 'words indexed')
}

loadCSV()

function parseCSV(data) {
  let lines = data.trim().split("\n")
  lines.shift()

  lines.forEach(line => {
    let cols = parseCSVLine(line)
    if (cols.length < 7) return

// id,title,overview,rel_date,popularity,vote_average,ticket_price,genre,movie_studio,availability,db_entry_date
    movies.push({
      name: cols[1],
      overview: cols[2],
      rel_date: parseDate(cols[3]),
      // ignore popularity
      rating: Number(cols[5]),
      ticket_price: parsePrice(cols[6]),
      genre: cols[7],
      movie_studio: cols[8],
      availability: parseBoolean(cols[9]),
      db_entry_date: parseDate(cols[10]),
    })
  })
}

function parseDate(value) {
  if (!value) return null
  let date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function parsePrice(value) {
  if (!value) return NaN
  let cleaned = value.replace(/[^0-9.,-]/g, "").replace(",", ".")
  return Number(cleaned)
}

function parseBoolean(value) {
  if (!value) return false
  let normalized = value.toString().trim().toLowerCase()
  return (
    normalized === "yes" //makes "yes" turn into "jā"
  )
}

function formatDate(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return "-"
  return value.toLocaleDateString("en-en")
}

function formatPrice(value) {
  if (Number.isNaN(value)) return "-"
  return new Intl.NumberFormat("lv-LV", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(value)
}

function parseCSVLine(line) { 
  let cols = []
  let current = ""
  let insideQuotes = false

  for (let i = 0; i < line.length; i++) {
    let char = line[i]

    if (char === '"') {
      insideQuotes = !insideQuotes
    } else if (char === "," && !insideQuotes) { //handles commas inside of quotes "they didn't know, that..."
      cols.push(current.trim())
      current = ""
    } else {
      current += char
    }
  }

  cols.push(current.trim())
  return cols
}

let movies = []

 
// remove caps and punctuation using regex

function normalizeWord(word) {
  return word.toLowerCase().replace(/[^\w]/g, '').trim()
}

 
// trie algorithm
 

class TrieNode {
  constructor() {
    this.children = {}
    this.end = false
    this.word = null
  }
}

let root = new TrieNode()

function insert(word) {
  let node = root
  for (let char of word) {
    if (!node.children[char]) node.children[char] = new TrieNode()
    node = node.children[char]
  }
  node.end = true
  node.word = word
}

function buildTrie() {
  movies.forEach(m => {
    m.name.toLowerCase().split(/\s+/).forEach(word => {
      word = normalizeWord(word)
      if (word.length > 0) insert(word)
    })
  })
}

function dfs(n, results, limit) {
    if (results.length >= limit) return
    if (n.end && n.word) results.push(n.word)
    for (let c in n.children) dfs(n.children[c], results, limit)
  }

function getWordsWithPrefix(prefix, limit = CANDIDATE_PREFIX_LIMIT) {
  prefix = normalizeWord(prefix)
  if (prefix.length === 0) return []

  let node = root
  for (let char of prefix) {
    if (!node.children[char]) return []
    node = node.children[char]
  }

  let results = []

  dfs(node, results, limit)
  return results
}

 
// index
 

let index = {}

function buildIndex() {
  index = {} // reset before building it
  movies.forEach((m, id) => {
    m.name.toLowerCase().split(/\s+/).forEach(word => { //makes search case insensitive
      word = normalizeWord(word)
      if (word.length === 0) return
      if (!index[word]) index[word] = []
      if (!index[word].includes(id)) index[word].push(id)
    })
  })
}

 
// fuzzy search for error tolerance (https://www.codementor.io/@anwarulislam/how-to-implement-fuzzy-search-in-javascript-2742dqz1p9)
 

function levenshtein(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0)
  )
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )
    }
  }

  return matrix[a.length][b.length]
}

// returns indexed words within a set threshold (can change from settings at the top)
function getFuzzyWords(queryWord, threshold = FUZZY_DISTANCE_THRESHOLD) {
  let matches = []
  for (let word in index) {
    // skip words that are longer than the search
    if (Math.abs(word.length - queryWord.length) > threshold) continue
    if (levenshtein(queryWord, word) <= threshold) matches.push(word)
  }
  return matches
}

 
// search
 

function search(query) {
  let queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .map(w => normalizeWord(w))
    .filter(w => w.length > 0)

  if (queryWords.length === 0) return []

  let candidateIDs = new Set()

  queryWords.forEach(q => {
    // exact match
    if (index[q]) index[q].forEach(id => candidateIDs.add(id))

    // match using prefix (autocomplete)
    getWordsWithPrefix(q, CANDIDATE_PREFIX_LIMIT).forEach(word => {
      if (index[word]) index[word].forEach(id => candidateIDs.add(id))
    })

    // fuzzy match (error tolerance)
    if (candidateIDs.size === 0 && q.length >= 3) {
      getFuzzyWords(q).forEach(word => {
        if (index[word]) index[word].forEach(id => candidateIDs.add(id))
      })
    }
  })

  if (candidateIDs.size === 0) return []

  // give scores to each item, higher score is closer to what the user wants
  let scored = []

  candidateIDs.forEach(id => {
    let movie = movies[id]
    let nameWords = movie.name.toLowerCase().split(/\s+/).map(normalizeWord) //remove caps before scoring
    let score = 0

    queryWords.forEach(q => {
      for (let w of nameWords) {
        if (w === q)            score += 100
        else if (w.startsWith(q)) score += 60
        else if (w.includes(q))   score += 30
        else {
          // give priority to fuzzy matched searches (error tolerance)
          let dist = levenshtein(q, w)
          if (dist === 1) score += 20
          else if (dist === 2) score += 10
        }
      }
    })

    if (score > 0) scored.push({ movie, score })
  })

  return scored
    .sort((a, b) => b.score - a.score)
    .map(x => x.movie)
}

 
// sort
 

function filterByRating(list, ratingFilter) {
  if (!ratingFilter) return list

  let [min, max] = ratingFilter.split("-").map(Number)

  return list.filter(m => {
    if (Number.isNaN(m.rating)) return false
    if (max === 10) return m.rating >= min && m.rating <= max
    return m.rating >= min && m.rating < max
  })
}
// filter by movie studio
function filterByStudio(list, studioFilter) {
  if (!studioFilter) return list
  return list.filter(m => m.movie_studio === studioFilter)
}

function filterByAvailability(list, availableOnly) {
  if (!availableOnly) return list
  return list.filter(m => m.availability)
}
// fill the movie studio filter box with values
function populateStudioFilter() {
  let studioSelect = document.getElementById("studioFilter")
  if (!studioSelect) return

  let studios = [...new Set(movies
    .map(m => (m.movie_studio || "").trim())
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))

  studios.forEach(studio => {
    let option = document.createElement("option")
    option.value = studio
    option.textContent = studio
    studioSelect.appendChild(option)
  })
}

function sortResults(list, type, query = "", order = "asc") {
  let direction = order === "desc" ? -1 : 1

  // defalt to sorting by relevance unless user has picked smth else
  if (type === "relevance" || (query.length > 0 && type === "name")) {
    if (order === "desc") return [...list].reverse() //if user picked descending, reverse the order
    return list // returns everything as is
  }
  if (type === "price")  return list.sort((a, b) => (a.ticket_price - b.ticket_price) * direction)
  if (type === "year")   return list.sort((a, b) => (a.rel_date - b.rel_date) * direction)
  if (type === "rating") return list.sort((a, b) => (a.rating - b.rating) * direction)
  if (type === "name")   return list.sort((a, b) => a.name.localeCompare(b.name) * direction)
  return list
}

// RENDER

function render(list) {
  let table = document.getElementById("results")
  table.innerHTML = ""

  list.forEach(m => {
    let overview = m.overview && m.overview.length >= 3
      ? m.overview
      : "Nav pieejams apraksts."

    let row = `
      <tr>
        <td>${m.name}</td>
        <td>${m.overview}</td>
        <td>${formatDate(m.rel_date)}</td>
        <td>${m.rating}</td>
        <td>${formatPrice(m.ticket_price)}</td>
        <td>${m.genre}</td>
        <td>${m.movie_studio}</td>
        <td>${m.availability ? "jā" : "nē"}</td>
        <td>${formatDate(m.db_entry_date)}</td>
      </tr>`

    table.innerHTML += row
  })
}

 
// delay for optimization (2000 ms)
 

// events
 

let searchBox  = document.getElementById("search")
let sortSelect = document.getElementById("sort")
let sortOrderSelect = document.getElementById("sort-order")
let ratingSelect = document.getElementById("ratingFilter")
let studioSelect = document.getElementById("studioFilter")
let availableOnlyCheckbox = document.getElementById("availableOnly")

function getSortOrder() { //checks if user picked asc or desc (default = asc)
  return sortOrderSelect.dataset.order === "desc" ? "desc" : "asc"
}

function updateAutocomplete(query) {
  let box = document.getElementById("autocomplete")
  box.innerHTML = ""

  // autocomplete using trie
  if (query.length >= 2) {
    let queryWord = normalizeWord(query.split(/\s+/).pop()) // complete the last word being typed
    let suggestions = getWordsWithPrefix(queryWord, AUTOCOMPLETE_LIMIT)

    suggestions.forEach(word => {
      let div = document.createElement("div")
      div.className = "suggestion"
      div.textContent = word
      div.onclick = () => {
        searchBox.value = word
        box.innerHTML = ""
        handleSearch(word)
      }
      box.appendChild(div)
    })
  }
}

function handleSearch(query) {
  updateAutocomplete(query)

  let ratingFilter = ratingSelect.value
  let studioFilter = studioSelect.value
  let availableOnly = availableOnlyCheckbox.checked
  let results

  if (query) { // if there is search text, search and then sort
    results = search(query)
    results = filterByRating(results, ratingFilter)
    results = filterByStudio(results, studioFilter)
    results = filterByAvailability(results, availableOnly)
    results = sortResults(results, sortSelect.value, query, getSortOrder())
  } else {
    results = filterByRating([...movies], ratingFilter)
    results = filterByStudio(results, studioFilter)
    results = filterByAvailability(results, availableOnly)
    results = sortResults(results, sortSelect.value, "", getSortOrder())
    results = results.slice(0, 100)
  }

  render(results)
}

//event listeners

searchBox.addEventListener("input", () => { //only update autocomplete while typing
  updateAutocomplete(searchBox.value.toLowerCase())
})

searchBox.addEventListener("keydown", (event) => { //run search when Enter is pressed
  if (event.key === "Enter") {
    event.preventDefault()
    handleSearch(searchBox.value.toLowerCase())
  }
})

sortSelect.addEventListener("change", () => { //listen for sort type change
  handleSearch(searchBox.value.toLowerCase())
})

sortOrderSelect.addEventListener("click", () => { //listen for toggle
  let nextOrder = getSortOrder() === "asc" ? "desc" : "asc"
  sortOrderSelect.dataset.order = nextOrder
  sortOrderSelect.textContent = nextOrder === "asc" ? "Augošā secībā" : "Dilstošā secībā"
  handleSearch(searchBox.value.toLowerCase())
})

ratingSelect.addEventListener("change", () => { //listen for rating filter change
  handleSearch(searchBox.value.toLowerCase())
})

studioSelect.addEventListener("change", () => { //listen for studio filter change
  handleSearch(searchBox.value.toLowerCase())
})

availableOnlyCheckbox.addEventListener("change", () => { //listen for availability filter change
  handleSearch(searchBox.value.toLowerCase())
})
