// initialize from movies.csv

async function loadCSV(){

let response = await fetch("movies.csv")
let text = await response.text()

parseCSV(text)

buildTrie()

// Try to load pre-built index, otherwise build it
try {
  let indexResponse = await fetch("index.json")
  if (indexResponse.ok) {
    index = await indexResponse.json()
  } else {
    buildIndex()
  }
} catch (e) {
  buildIndex()
}

// Don't render all movies on load - only render when searching
let allResults = sortResults(movies, "name", "")
render(allResults.slice(0, 100))

console.log('Ready! The index has', Object.keys(index).length, 'words indexed. Showing first 100 movies...')

}

loadCSV()

//csv reader/parser


function parseCSV(data){

let lines = data.trim().split("\n")

lines.shift() // remove header

lines.forEach(line=>{

let cols = parseCSVLine(line)

if(cols.length < 7) return

let year = cols[3] ? cols[3].split("-")[0] : ""

movies.push({
name: cols[0],
overview: cols[1],
author: cols[2],
sales: Number(cols[4]) || 0,

year: Number(year) || 0,
rating: Number(cols[6]) || 0
})

})

}

function parseCSVLine(line){

let cols = []
let current = ""
let insideQuotes = false

for(let i = 0; i < line.length; i++){

let char = line[i]

if(char === '"'){
insideQuotes = !insideQuotes
}
else if(char === "," && !insideQuotes){
cols.push(current.trim())
current = ""
}
else{
current += char
}

}

cols.push(current.trim())

return cols

}

let movies = [] //empty since i've got csv file



// --------------------
// fast prefix check
// --------------------

function getWordsWithPrefix(prefix, limit = 50){

  prefix = normalizeWord(prefix)
  if(prefix.length === 0) return []

  let node = root

  // walk down trie
  for(let char of prefix){
    if(!node.children[char]) return []
    node = node.children[char]
  }

  let results = []

  function dfs(n){
    if(results.length >= limit) return

    if(n.end && n.word){
      results.push(n.word)
    }

    for(let c in n.children){
      dfs(n.children[c])
    }
  }

  dfs(node)

  return results
}

let index = {}


// debounce/throttle function to limit how often search runs while typing
function debounce(fn, delay = 200) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

// --------------------
// TRIE FOR AUTOCOMPLETE
// --------------------

class TrieNode {
  constructor() {
    this.children = {}
    this.end = false
    this.word = null
  }
}

let root = new TrieNode()

function insert(word){
  let node = root

  for(let char of word){
    if(!node.children[char]){
      node.children[char] = new TrieNode()
    }
    node = node.children[char]
  }

  node.end = true
  node.word = word
}

function buildTrie(){

movies.forEach(m=>{
let titleWords = m.name.toLowerCase().split(/\s+/)
titleWords.forEach(word => {
  word = normalizeWord(word)
  if(word && word.length > 0){
    insert(word)
  }
})
})

}

// --------------------
// WORD NORMALIZATION
// --------------------

function normalizeWord(word) {
  // Remove punctuation, convert to lowercase, trim
  return word.toLowerCase().replace(/[^\w]/g, '').trim()
}

function buildIndex(){

movies.forEach((m, id)=>{
// Index ONLY title words
let titleWords = (m.name).toLowerCase().split(/\s+/)
titleWords.forEach(word=>{
  word = normalizeWord(word)
  if(word && word.length > 0){
    if(!Array.isArray(index[word])){
      index[word] = []
    }
    if(!index[word].includes(id)){
      index[word].push(id)
    }
  }
})
})

}


function autocomplete(prefix){

prefix = normalizeWord(prefix)

if(prefix.length === 0) return []

let node=root

for(let char of prefix){

if(!node.children[char]) return []

node=node.children[char]

}

let results=[]

function dfs(n,str){

if(results.length>5) return

if(n.end) results.push(str)

for(let c in n.children){
dfs(n.children[c],str+c)
}

}

dfs(node,prefix)

return results

}



// --------------------
// SEARCH
// --------------------

function search(query){

  let queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .map(w => normalizeWord(w))
    .filter(w => w.length > 0)

  if(queryWords.length === 0) return []

  let candidateIDs = new Set()

// STEP 1: get candidates using index + trie
queryWords.forEach(q => {

  // exact match
  if(index[q]){
    index[q].forEach(id => candidateIDs.add(id))
  }

  // 🔥 prefix match via trie (fast)
  let words = getWordsWithPrefix(q, 50) // capped

  words.forEach(word => {
    if(index[word]){
      index[word].forEach(id => candidateIDs.add(id))
    }
  })

})

  // fallback if nothing found
  if(candidateIDs.size === 0){
    return []
  }

  // STEP 2: score only candidates (NOT all movies)
  let scored = []

  candidateIDs.forEach(id => {

    let movie = movies[id]
    let name = movie.name.toLowerCase()
    let nameWords = name.split(/\s+/)

    let score = 0

    queryWords.forEach(q => {
      for(let w of nameWords){
        if(w === q) score += 100
        else if(w.startsWith(q)) score += 60
        else if(w.includes(q)) score += 30
      }
    })

    if(score > 0){
      scored.push({ movie, score })
    }

  })

  return scored
    .sort((a,b) => b.score - a.score)
    .map(x => x.movie)
}


// Levenshtein algorithm for more error tolerance
function levenshtein(a, b){
  const matrix = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0)
  )

  for(let i = 0; i <= a.length; i++) matrix[i][0] = i
  for(let j = 0; j <= b.length; j++) matrix[0][j] = j

  for(let i = 1; i <= a.length; i++){
    for(let j = 1; j <= b.length; j++){
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

// --------------------
// RELEVANCE SCORING
// --------------------

function calculateRelevance(movieName, query){
const name = movieName.toLowerCase()
const queryWords = query.toLowerCase().split(/\s+/).map(w => normalizeWord(w)).filter(w => w.length > 0)

let totalScore = 0

// Check each word in the query against ONLY the title
queryWords.forEach(q => {
  // Normalize query word
  q = normalizeWord(q)
  
  // Exact match in title
  if(name === q) totalScore += 10000
  // Starts with query in title
  else if(name.startsWith(q)) totalScore += 5000
  else {
    // Word boundary match in title
    const nameWords = name.split(/\s+/)
    if(nameWords.some(w => w === q)) totalScore += 4000
    else if(nameWords.some(w => w.startsWith(q))) totalScore += 3000
    // Contains query in title
    else if(name.includes(q)) totalScore += 2000
  }
})

return totalScore
}

function sortResults(list,type,query=""){

// If there's a search query, sort by relevance
if(query.length > 0){
return list.sort((a,b)=>{
const scoreA = calculateRelevance(a.name, query)
const scoreB = calculateRelevance(b.name, query)
return scoreB - scoreA
})
}

if(type==="name"){
return list.sort((a,b)=>a.name.localeCompare(b.name))
}

if(type==="sales"){
return list.sort((a,b)=>b.sales-a.sales)
}

if(type==="year"){
return list.sort((a,b)=>b.year-a.year)
}

if(type==="rating"){
return list.sort((a,b)=>b.rating-a.rating)
}

return list
}



// --------------------
// RENDER
// --------------------

function render(list){

let table=document.getElementById("results")

table.innerHTML=""

list.forEach(m=>{

if (m.overview.length<3) {
    m.overview="Nav pieejams apraksts."
}

let row=`
<tr>
<td>${m.name}</td>
<td>${m.overview}</td>
<td>${m.author}</td>
<td>${m.sales}</td>
<td>${m.year}</td>
<td>${m.rating}</td>
</tr>
`

table.innerHTML+=row

})

}



// --------------------
// EVENTS
// --------------------

let searchBox=document.getElementById("search")
let sortSelect=document.getElementById("sort")

const handleSearch = debounce((query) => {

  let box = document.getElementById("autocomplete")
  box.innerHTML = ""

  // AUTOCOMPLETE (limit results) - only when typing
  if(query.length >= 2){
    let count = 0

    for (const key in index) {
      if (key.startsWith(query)) {

        let div = document.createElement("div")
        div.className = "suggestion"
        div.textContent = key

        div.onclick = () => {
          searchBox.value = key
          box.innerHTML = ""
        }

        box.appendChild(div)

        count++
        if (count >= 5) break // limit autofill
      }
    }
  }

  // SEARCH RESULTS
  let results

  if(query) {
    // User is actively searching
    results = search(query)
    results = sortResults(results, sortSelect.value, query)
  } else {
    // Search is empty - show all 100 items with selected sort
    results = sortResults(movies, sortSelect.value, "")
    results = results.slice(0, 100)
  }

  render(results)

}, 200)

searchBox.addEventListener("input", () => {
  handleSearch(searchBox.value.toLowerCase())
})





sortSelect.addEventListener("change",()=>{

let query=searchBox.value

let results

if(query) {
  // If searching, use search function and ignore sort dropdown
  results = search(query)
  results = sortResults(results, sortSelect.value, query)
} else {
  // If not searching, show first 100 items with selected sort
  results = sortResults(movies, sortSelect.value, "")
  results = results.slice(0, 100)
}

render(results)

})
