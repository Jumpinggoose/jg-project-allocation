'use strict';
function localDate(){var d=new Date(),o=d.getTimezoneOffset();return new Date(d.getTime()-o*60000).toISOString().slice(0,10);}
function duration(m){m=Math.round(Number(m||0));var h=Math.floor(m/60),n=m%60;return h?(n?h+'h '+n+'m':h+'h'):n+'m';}
function longDate(v){return new Date(v+'T00:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});}
