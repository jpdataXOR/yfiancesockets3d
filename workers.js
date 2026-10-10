export default {
  async fetch(req) {
    const instruments = [
      "AUDUSD=X","AUDJPY=X","AUDNZD=X","AUDCHF=X","AUDCAD=X",
      "EURUSD=X","JPY=X","GBPUSD=X","CAD=X","CHF=X",
      "NZDUSD=X","EURGBP=X","EURJPY=X","GBPJPY=X","EURCHF=X",
      "CADJPY=X","EURCAD=X","EURNZD=X","EURAUD=X","GBPAUD=X",
      "GBPCAD=X","GBPNZD=X","CADCHF=X","NZDCHF=X","NZDJPY=X",
      "SEK=X","NOK=X","DKK=X","BTCUSD=X"
    ];

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Live Forex Dashboard</title>
<style>
  body { font-family: sans-serif; padding: 1rem; background:#f2f2f2; }
  h1 { text-align: center; margin-bottom: 1rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(180px,1fr)); gap: 8px; }
  .card { background:#fff; padding:8px; border-radius:4px; box-shadow:0 0 4px rgba(0,0,0,0.1); text-align:center; font-size:0.9rem; }
  .price { font-weight:bold; font-size:1.2rem; transition: color 0.2s; }
  canvas { width:100%; height:40px; display:block; margin-top:4px; }
  .time { font-size:0.8rem; color:#666; margin-top:2px; }
  #total-data { text-align:center; margin-bottom:1rem; font-weight:bold; }
</style>
</head>
<body>
<h1>Live Forex Dashboard</h1>
<div style="text-align:center; margin-bottom:0.5rem;">
  <span id="current-time">--:--:--</span> | 
  <span id="current-date">--/--/----</span>
</div>
<div id="total-data">Total Data Received: 0 MB</div>
<div class="grid" id="grid">
  ${instruments.map(sym=>`
    <div class="card" id="card-${sym}">
      <div>${sym}</div>
      <div class="price" id="price-${sym}">--</div>
      <div class="time" id="time-${sym}">--:--:--</div>
      <canvas id="chart-${sym}"></canvas>
    </div>
  `).join('')}
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/protobufjs/7.2.3/protobuf.min.js"></script>
<script>
  const instruments = ${JSON.stringify(instruments)};

  // --- Protobuf schema ---
  const protoJSON = {
    "nested": {
      "PricingData": {
        "fields": {
          "id": { "type": "string", "id": 1 },
          "price": { "type": "float", "id": 2 },
          "time": { "type": "sint64", "id": 3 }
        }
      }
    }
  };

  const root = protobuf.Root.fromJSON(protoJSON);
  const PricingData = root.lookupType("PricingData");

  // --- State per instrument ---
  const state = {};
  let totalBytes = 0;
  instruments.forEach(sym => {
    state[sym] = { prices: [], last: null, chart: document.getElementById("chart-"+sym).getContext("2d") };
  });

  const totalDataElem = document.getElementById("total-data");

  // --- WebSocket connection ---
  const ws = new WebSocket('wss://streamer.finance.yahoo.com/?version=2');
  ws.onopen = () => {
    console.log('WebSocket connected');
    ws.send(JSON.stringify({ subscribe: instruments }));
  };

  ws.onmessage = (event) => {
    // Update total data in MB
    totalBytes += event.data.length;
    const mb = (totalBytes / (1024*1024)).toFixed(2);
    totalDataElem.innerText = 'Total Data Received: ' + mb + ' MB';
  
    try {
      const msg = JSON.parse(event.data);
      if(msg.type==="pricing"){
        const bytes = Uint8Array.from(atob(msg.message), c=>c.charCodeAt(0));
        const decoded = PricingData.decode(bytes);
        const sym = decoded.id;
        if(state[sym]){
          const priceElem = document.getElementById("price-"+sym);
          const timeElem = document.getElementById("time-"+sym);
          const ctx = state[sym].chart;
  
          // Color based on price change
          let color = "black";
          if(state[sym].last !== null){
            color = decoded.price > state[sym].last ? "green" : (decoded.price < state[sym].last ? "red":"black");
          }
          state[sym].last = decoded.price;
  
          // Update price
          priceElem.innerText = decoded.price.toFixed(4);
          priceElem.style.color = color;
  
          // Update last updated time hh:mm:ss
          const date = new Date();
          const hh = String(date.getHours()).padStart(2,'0');
          const mm = String(date.getMinutes()).padStart(2,'0');
          const ss = String(date.getSeconds()).padStart(2,'0');
          timeElem.innerText = hh + ':' + mm + ':' + ss;
  
          // Update sparkline
          state[sym].prices.push(decoded.price);
          if(state[sym].prices.length>50) state[sym].prices.shift();
  
          ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);
          ctx.beginPath();
          ctx.strokeStyle = color;
          const w = ctx.canvas.width;
          const h = ctx.canvas.height;
          const data = state[sym].prices;
          const min = Math.min(...data);
          const max = Math.max(...data);
          data.forEach((p,i)=>{
            const x = i/(data.length-1)*w;
            const y = h - ((p-min)/(max-min||1))*h;
            if(i===0) ctx.moveTo(x,y);
            else ctx.lineTo(x,y);
          });
          ctx.stroke();
        }
      }
    } catch(e){ console.warn("Decode error:", event.data,e);}
  };
  

  ws.onerror = (err) => console.error("WebSocket error", err);
  ws.onclose = () => console.log("WebSocket closed");


  function updateClock() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2,'0');
    const mm = String(now.getMinutes()).padStart(2,'0');
    const ss = String(now.getSeconds()).padStart(2,'0');
    const day = String(now.getDate()).padStart(2,'0');
    const month = String(now.getMonth()+1).padStart(2,'0');
    const year = now.getFullYear();
    
    document.getElementById("current-time").innerText = hh + ':' + mm + ':' + ss;
    document.getElementById("current-date").innerText = day + '/' + month + '/' + year;
  }
  
  // Update every second
  setInterval(updateClock, 1000);
  updateClock(); // initial call

  

</script>
</body>
</html>
    `;

    return new Response(html, { headers: { "content-type": "text/html;charset=UTF-8" } });
  }
};
