// initialize from movies.csv

async function loadCSV(){

let response = await fetch("movies.csv")
let text = await response.text()

parseCSV(text)

buildTrie()
buildIndex()
render(movies)

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
age: cols[5],
year: Number(year) || 0,
rating: Number(cols[6]) || 0
})

console.log(cols[1])

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
// INVERTED INDEX
// --------------------

let index = {}


// --------------------
// TRIE FOR AUTOCOMPLETE
// --------------------

class TrieNode{
constructor(){
this.children={}
this.end=false
}
}

let root = new TrieNode()

function insert(word){

let node=root

for(let char of word){

if(!node.children[char]){
node.children[char]=new TrieNode()
}

node=node.children[char]
}

node.end=true

}

function buildTrie(){

movies.forEach(m=>{
insert(m.name.toLowerCase())
})

}

function buildIndex(){

movies.forEach((m, id)=>{
let words = (m.name).toLowerCase().split(/\s+/)
words.forEach(word=>{
if(word && word.length > 0){
if(!Array.isArray(index[word])){
index[word] = []
}
index[word].push(id)
}
})
})

}


function autocomplete(prefix){

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

query=query.toLowerCase().split(" ")

let resultIDs = new Set()
query.forEach(word=>{

if(index[word]){

index[word].forEach(id=>resultIDs.add(id))

}

})

return [...resultIDs].map(id=>movies[id])

}



// --------------------
// SORTING
// --------------------

function sortResults(list,type){

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

list.slice(0,100).forEach(m=>{

let row=`
<tr>
<td>${m.name}</td>
<td>${m.overview}</td>
<td>${m.author}</td>
<td>${m.sales}</td>
<td>${m.age}</td>
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

searchBox.addEventListener("input",()=>{

let query=searchBox.value

let suggestions = autocomplete(query.toLowerCase())

let box=document.getElementById("autocomplete")

box.innerHTML=""

suggestions.forEach(s=>{

let div=document.createElement("div")
div.className="suggestion"
div.textContent=s

div.onclick=()=>{
searchBox.value=s
box.innerHTML=""
}

box.appendChild(div)

})


let results = query ? search(query) : movies

results = sortResults(results,sortSelect.value)

render(results)

})



sortSelect.addEventListener("change",()=>{

let query=searchBox.value

let results = query ? search(query) : movies

results = sortResults(results,sortSelect.value)

render(results)

})
