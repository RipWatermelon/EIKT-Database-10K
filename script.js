// --------------------
// settings
// --------------------

const AUTOCOMPLETE_LIMIT = 5 // how many autocompletes will be sohwn
const CANDIDATE_PREFIX_LIMIT = 50 // check up to 50 matching words max (then we do fuzzy search)
const FUZZY_DISTANCE_THRESHOLD = 2 // max edits/mistakes allowed for search to be returned (jhn -> john is 1 edit, jhnn -> john is 2 edits))

// --------------------
// CSV LOADING
// --------------------

async function loadCSV() {
  let response = await fetch("movies.csv")
  let text = await response.text()

  parseCSV(text)
  buildTrie()
  buildIndex() // rebuilds index.json every time in case movies.csv changes

  let allResults = sortResults([...movies], "name", "")
  render(allResults.slice(0, 100))

  console.log('Ready!', movies.length, 'movies loaded,', Object.keys(index).length, 'words indexed.')
}

loadCSV()

function parseCSV(data) {
  let lines = data.trim().split("\n")
  lines.shift()

  lines.forEach(line => {
    let cols = parseCSVLine(line)
    if (cols.length < 7) return

    let year = cols[3] ? cols[3].split("-")[0] : ""

    movies.push({
      name: cols[0],
      overview: cols[1],
      author: cols[2],
      sales: Number(cols[4]),
      year: Number(year),
      rating: Number(cols[6])
    })
  })
}

function parseCSVLine(line) {
  let cols = []
  let current = ""
  let insideQuotes = false

  for (let i = 0; i < line.length; i++) {
    let char = line[i]

    if (char === '"') {
      insideQuotes = !insideQuotes
    } else if (char === "," && !insideQuotes) {
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

// --------------------
// word normalization
// --------------------

function normalizeWord(word) {
  return word.toLowerCase().replace(/[^\w]/g, '').trim()
}

// --------------------
// trie
// --------------------

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

// --------------------
// index
// --------------------

let index = {}

function buildIndex() {
  index = {} // reset so no problems with index.json being old
  movies.forEach((m, id) => {
    m.name.toLowerCase().split(/\s+/).forEach(word => {
      word = normalizeWord(word)
      if (word.length === 0) return
      if (!index[word]) index[word] = []
      if (!index[word].includes(id)) index[word].push(id)
    })
  })
}

// --------------------
// fuzzy search (https://www.codementor.io/@anwarulislam/how-to-implement-fuzzy-search-in-javascript-2742dqz1p9)
// --------------------

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
    // skip words that are way longer than the search
    if (Math.abs(word.length - queryWord.length) > threshold) continue
    if (levenshtein(queryWord, word) <= threshold) matches.push(word)
  }
  return matches
}

// --------------------
// search
// --------------------

function search(query) {
  let queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .map(w => normalizeWord(w))
    .filter(w => w.length > 0)

  if (queryWords.length === 0) return []

  let candidateIDs = new Set()

  queryWords.forEach(q => {
    // 1. exact match
    if (index[q]) index[q].forEach(id => candidateIDs.add(id))

    // 2. prefix match with trie
    getWordsWithPrefix(q, CANDIDATE_PREFIX_LIMIT).forEach(word => {
      if (index[word]) index[word].forEach(id => candidateIDs.add(id))
    })

    // 3. fuzzy match (only if 1 and 2 gave up)
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
          // give priority to fuzzy matched searches
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

// --------------------
// sort
// --------------------

function filterByRating(list, ratingFilter) {
  if (!ratingFilter) return list

  let [min, max] = ratingFilter.split("-").map(Number)

  return list.filter(m => {
    if (Number.isNaN(m.rating)) return false
    if (max === 10) return m.rating >= min && m.rating <= max
    return m.rating >= min && m.rating < max
  })
}

function sortResults(list, type, query = "") {
  // when there's an active query, search() already returns results ranked
  // by relevance, don't re-sort by name/year/etc. unless the user has
  // changed the sort dropdown while searching
  if (type === "relevance" || (query.length > 0 && type === "name")) {
    return list // preserve search ranking
  }
  if (type === "sales")  return list.sort((a, b) => b.sales - a.sales)
  if (type === "year")   return list.sort((a, b) => b.year - a.year)
  if (type === "rating") return list.sort((a, b) => b.rating - a.rating)
  if (type === "name")   return list.sort((a, b) => a.name.localeCompare(b.name))
  return list
}

// --------------------
// render
// --------------------

function render(list) {
  let table = document.getElementById("results")
  table.innerHTML = ""

  list.forEach(m => {
    let overview = m.overview && m.overview.length >= 3
      ? m.overview
      : "Nav pieejams apraksts." // makes it prettier for the end user

    let row = `
      <tr>
        <td>${m.name}</td>
        <td>${overview}</td>
        <td>${m.author}</td>
        <td>${m.sales}</td>
        <td>${m.year}</td>
        <td>${m.rating}</td>
      </tr>`

    table.innerHTML += row
  })
}

// --------------------
// delay (no more lag)
// --------------------

function debounce(fn, delay = 200) {
  let timeout
  return (...args) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => fn(...args), delay)
  }
}

// --------------------
// events
// --------------------

let searchBox  = document.getElementById("search")
let sortSelect = document.getElementById("sort")
let ratingSelect = document.getElementById("ratingFilter")

const handleSearch = debounce((query) => {
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

  let ratingFilter = ratingSelect.value
  let results

  if (query) {
    results = search(query)
    results = filterByRating(results, ratingFilter)
    results = sortResults(results, sortSelect.value, query)
  } else {
    results = filterByRating([...movies], ratingFilter)
    results = sortResults(results, sortSelect.value, "")
    results = results.slice(0, 100)
  }

  render(results)
}, 200)

searchBox.addEventListener("input", () => {
  handleSearch(searchBox.value.toLowerCase())
})

sortSelect.addEventListener("change", () => {
  handleSearch(searchBox.value.toLowerCase())
})

ratingSelect.addEventListener("change", () => {
  handleSearch(searchBox.value.toLowerCase())
})
