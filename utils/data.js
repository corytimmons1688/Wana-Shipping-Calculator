export const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export const INIT_MARKETS = [
  {name:"Colorado",goLive:7,priority:true,demand:[149319,135310,149420,139920,165750,177110,196015,208661,208027,229979,222560,227139]},
  {name:"Arizona",goLive:8,priority:true,demand:[84630,76440,88660,105000,69750,72000,61132,53940,48720,80600,85050,84630]},
  {name:"Arkansas",goLive:12,priority:false,demand:[13643,11866,15159,14670,12633,12225,14148,14148,13608,14582,14616,13541]},
  {name:"Canada",goLive:null,priority:false,demand:[0,0,0,0,0,0,0,0,0,0,0,0]},
  {name:"Connecticut",goLive:12,priority:false,demand:[11052,11270,14105,12420,12834,13110,13547,13547,13110,13547,13110,13547]},
  {name:"Florida",goLive:12,priority:false,demand:[27983,25346,27846,31954,26177,24372,23590,25179,20520,21204,26190,27063]},
  {name:"Illinois",goLive:8,priority:true,demand:[75082,69269,101060,110880,84348,76315,112499,98208,99000,92070,86130,89001]},
  {name:"Maryland",goLive:12,priority:false,demand:[22320,21168,24180,22680,23436,22680,21576,21576,20880,21576,20880,21576]},
  {name:"Massachusetts",goLive:7,priority:true,demand:[41850,45360,58590,61171,65844,66420,69750,69795,64994,74367,73986,76452]},
  {name:"Michigan",goLive:12,priority:false,demand:[63536,63113,66307,55510,61068,61502,69774,56565,61716,62156,59946,62538]},
  {name:"Mississippi",goLive:11,priority:false,demand:[5242,2894,2691,2934,3112,3494,2999,1973,2075,2932,2506,3070]},
  {name:"Missouri",goLive:12,priority:false,demand:[19790,14918,26381,32634,39010,25200,32240,32240,31200,32240,31200,32240]},
  {name:"Montana",goLive:12,priority:false,demand:[21266,18620,21700,32640,26040,26250,29295,28210,27930,27807,27300,27776]},
  {name:"Nevada",goLive:null,priority:false,demand:[0,0,25500,26288,31320,23870,27280,19080,24180,21600,22320,0]},
  {name:"New Jersey",goLive:5,priority:true,demand:[32736,34160,41602,42090,45384,50220,55800,59520,71400,89280,102600,124000]},
  {name:"New Mexico",goLive:11,priority:false,demand:[28374,25628,36270,34200,28374,27459,28374,28374,27459,28374,27459,28374]},
  {name:"New York",goLive:7,priority:true,demand:[13392,16660,19530,19950,19879,27900,39130,50778,61718,78120,75600,78120]},
  {name:"Ohio",goLive:9,priority:true,demand:[42408,38538,53061,42289,42069,43158,44115,45879,38917,41777,50625,52313]},
  {name:"Oklahoma",goLive:11,priority:false,demand:[5055,5513,6082,6056,5021,4490,5077,6244,4875,5593,4190,5834]},
  {name:"Puerto Rico",goLive:null,priority:false,demand:[0,0,0,0,0,0,0,0,0,0,0,0]},
];

export const INIT_SHIPPING = [
  {method:"Standard Ocean",transitDays:45,costPerUnit:0,notes:"Free full containers"},
  {method:"Fast Boat",transitDays:25,costPerUnit:0,notes:"Container pricing"},
  {method:"Air",transitDays:10,costPerUnit:0.80,notes:"Per-unit emergency"},
];

export const INIT_MOLDS = {
  base:{
    proto:{mat:"HDPE",daily:3800,avail:"2026-03-15",life:50000,days:6,cav:4,qty:1,cost:2875},
    prod:{mat:"HDPE",daily:7800,avail:"2026-04-27",life:null,days:6,cav:4,qty:4,cost:2875}
  },
  lid:{
    proto:{mat:"PP",daily:1750,avail:"2026-03-15",life:50000,days:6,cav:8,qty:1,cost:11500},
    prod:{mat:"PP",daily:14050,avail:"2026-05-25",life:null,days:6,cav:8,qty:2,cost:11500}
  }
};

export const INIT_CONTAINERS = {
  "20HC":{label:"20\' HC",cost:9500,min:24000,max:65000},
  "40HC":{label:"40\' HC",cost:14300,min:0,max:170000}
};

export const INIT_PARAMS = {baseLeadDays:14,lidLeadDays:7,rounding:10000};

export const INIT_PROTO_MOLDS = [
  {name:"Lid Mold VN",cost:1300,qty:1},{name:"EBM Jar VN",cost:1850,qty:1},
  {name:"Lid Mold CN",cost:2000,qty:1},{name:"EBM Jar CN",cost:1000,qty:1},
  {name:"IBM Jar CN",cost:2000,qty:1}
];

export const INIT_EQUIPMENT = [
  {name:"PE Label Applicator Change Parts",cost:29389,qty:1},
  {name:"KapsAll Change Parts",cost:17132,qty:1},
  {name:"Die Tool for Lid Liner",cost:450,qty:1}
];

export const INIT_PROTO_TL = [
  {step:"Confirm Design",start:"Feb 27",end:"Feb 28",days:1},
  {step:"Mold Prototype Adjust",start:"Feb 28",end:"Mar 10",days:10},
  {step:"Color Matching",start:"TBD",end:"TBD",days:6},
  {step:"T1 Samples + Mass Production",start:"Mar 15",end:"Apr 12",days:28},
  {step:"Printing / Color Matching",start:"Apr 12",end:"Apr 17",days:5}
];

export const INIT_PROD_TL = [
  {step:"Confirm Design",start:"Feb 27",end:"Feb 28",days:1},
  {step:"EBM Jar Mold Production",start:"Feb 28",end:"Apr 4",days:35},
  {step:"T0 Sample (EBM)",start:"Apr 4",end:"Apr 7",days:3},
  {step:"T1 + Mass Prod (EBM)",start:"Apr 7",end:"Apr 17",days:10},
  {step:"1st Cap Mold (INJ)",start:"Feb 28",end:"Apr 29",days:60},
  {step:"T0 Cap Sample",start:"Apr 29",end:"Apr 30",days:1},
  {step:"T1 Cap Samples",start:"Apr 30",end:"May 7",days:7},
  {step:"Finish + Mass Production",start:"May 8",end:"May 13",days:5}
];

export const INIT_FORECAST = [
  {period:"T4 (May)",qty:175000,days:16.2,start:"May 13",end:"May 29"},
  {period:"T5 (Jun)",qty:350000,days:12.4,start:"May 29",end:"Jun 11"},
  {period:"T6 (Jun-Jul)",qty:500000,days:17.8,start:"Jun 11",end:"Jun 28"},
  {period:"T7 (Jul)",qty:500000,days:17.8,start:"Jun 28",end:"Jul 16"},
  {period:"T8 (Jul-Aug)",qty:525000,days:18.6,start:"Jul 16",end:"Aug 4"},
  {period:"T9 (Aug)",qty:675000,days:24.0,start:"Aug 4",end:"Aug 28"},
  {period:"T10 (Sep)",qty:775000,days:27.5,start:"Aug 28",end:"Sep 24"},
  {period:"T11 (Oct)",qty:800000,days:28.4,start:"Sep 24",end:"Oct 23"}
];

export const INIT_PKL = [
  {cont:"20\' HC",item:"Wana Jar",pallets:8,qpc:72576,wt:"2,070 kg",cbm:19.36},
  {cont:"20\' HC",item:"Wana Cap",pallets:2,qpc:61440,wt:"972 kg",cbm:5.04},
  {cont:"40\' HC",item:"Wana Jar",pallets:15,qpc:170100,wt:"4,823 kg",cbm:44.83},
  {cont:"40\' HC",item:"Wana Cap",pallets:5,qpc:179200,wt:"2,829 kg",cbm:14.58}
];

export function dc(o) { return JSON.parse(JSON.stringify(o)); }

export function initScenarioData() {
  return {
    markets: dc(INIT_MARKETS), shipping: dc(INIT_SHIPPING), molds: dc(INIT_MOLDS),
    containers: dc(INIT_CONTAINERS), params: dc(INIT_PARAMS), protoMolds: dc(INIT_PROTO_MOLDS),
    equipment: dc(INIT_EQUIPMENT), protoTL: dc(INIT_PROTO_TL), prodTL: dc(INIT_PROD_TL),
    forecast: dc(INIT_FORECAST), pkl: dc(INIT_PKL)
  };
}

export function makeScenario(name, base) {
  return { id: Date.now() + Math.random(), name, ...dc(base) };
}
