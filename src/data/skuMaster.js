// skuMaster.js — Master SKU registry for Wana production planning
// Base type determines which jar body is used (Black Sparkle vs White)

export const BASE_TYPES = {
  "Black Sparkle": { sku: "PB-WCB-221-00", color: "#1a1a2e" },
  "White":         { sku: "PB-WCB-002-00", color: "#e8e8e8" },
};

export const MASTER_SKUS = [
  // Optimal — Black Sparkle base
  { sku:"PL-WCB-105-00", name:"Good Time Clementine",       cat:"Optimal", base:"Black Sparkle" },
  { sku:"PL-WCB-110-00", name:"Stay Asleep Dreamberry",     cat:"Optimal", base:"Black Sparkle" },
  { sku:"PL-WCB-115-00", name:"Swift Recovery Cherry Cola",  cat:"Optimal", base:"Black Sparkle" },
  { sku:"PL-WCB-120-00", name:"Fast Asleep Grape",          cat:"Optimal", base:"Black Sparkle" },
  { sku:"PL-WCB-125-00", name:"Keep Calm Blissberry",       cat:"Optimal", base:"Black Sparkle" },
  // Quick — White base
  { sku:"PL-WCB-460-00", name:"Bubbly Peach",               cat:"Quick",   base:"White" },
  { sku:"PL-WCB-465-00", name:"Sunrise",                    cat:"Quick",   base:"White" },
  { sku:"PL-WCB-470-00", name:"Paradise POG",               cat:"Quick",   base:"White" },
  { sku:"PL-WCB-475-00", name:"Bright Berry Lime",          cat:"Quick",   base:"White" },
  { sku:"PL-WCB-480-00", name:"Peaceful Pear",              cat:"Quick",   base:"White" },
  { sku:"PL-WCB-485-00", name:"Relaxed Raspberry",          cat:"Quick",   base:"White" },
  // Classic — White base
  { sku:"PL-WCB-425-00", name:"Chill Black Cherry",         cat:"Classic", base:"White" },
  { sku:"PL-WCB-405-00", name:"Go Go Mango",                cat:"Classic", base:"White" },
  { sku:"PL-WCB-410-00", name:"Serene Yuzu",                cat:"Classic", base:"White" },
  { sku:"PL-WCB-415-00", name:"Blissful Blueberry",         cat:"Classic", base:"White" },
  { sku:"PL-WCB-420-00", name:"Passion Pineapple",          cat:"Classic", base:"White" },
  { sku:"PL-WCB-430-00", name:"Mellow Melon",               cat:"Classic", base:"White" },
  { sku:"PL-WCB-435-00", name:"Balanced Berry Guava",       cat:"Classic", base:"White" },
  { sku:"PL-WCB-440-00", name:"Breezy Pineapple",           cat:"Classic", base:"White" },
  // LTO — White base
  { sku:"PL-WCB-LTO-01", name:"Razzcherry Rocket LTO",     cat:"LTO",     base:"White" },
  // HD (CO Wave 3 assorted — no individual SKU codes yet)
  { sku:"PL-WCB-HD-01",  name:"High Dose Assorted",         cat:"HD",      base:"White" },
];
