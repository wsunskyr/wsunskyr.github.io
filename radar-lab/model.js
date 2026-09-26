(function(root){
'use strict';
const C=299792458,K=1.380649e-23,T0=290,db=x=>10*Math.log10(Math.max(x,1e-30));
const base={fc:140,bw:4,tc:100,idle:20,n:64,r:10,v:0,rcs:0,eirp:20,einf:10,loss:0,alpha:0,ifbw:15,fs:40,enob:10,jitter:.5,backoff:12,threshold:13,impl:3,mult:4,pn:-100};
const presets={generic:{...base},range:{...base,r:30,bw:1},fine:{...base,bw:12}};
function calculate(p){
 const lambda=C/(p.fc*1e9),B=p.bw*1e9,Tc=p.tc*1e-6,Tr=(p.tc+p.idle)*1e-6,tau=2*p.r/C,Tobs=Math.max(1e-12,Tc-tau),slope=B/Tc,fd=2*p.v/lambda,beat=slope*tau-fd;
 const atm=2*p.alpha*p.r/1000,spread=20*Math.log10(lambda)-30*Math.log10(4*Math.PI)-40*Math.log10(p.r);
 // EINF is already referred to an isotropic receiving antenna. No Gr term belongs here.
 const pr=p.eirp+p.rcs+spread-p.loss-atm,noiseBW=p.ifbw*1e6,noise=db(K*T0*noiseBW)+30+p.einf,snrIn=pr-noise,processing=db(noiseBW*Tobs*p.n),snr=snrIn+processing-p.impl,margin=snr-p.threshold;
 const rangeRes=C/(2*B),effectiveRes=C/(2*slope*Tobs),vmax=lambda/(4*Tr),vres=lambda/(2*p.n*Tr),iflimit=Math.min(p.ifbw*1e6,p.fs*1e6/2),rangeIF=Math.max(0,(iflimit-Math.abs(fd))*C/(2*slope)),ns=Math.floor(p.fs*1e6*Tobs);
 const snrJ=-20*Math.log10(Math.max(1e-18,2*Math.PI*Math.abs(beat)*p.jitter*1e-12)),snrQ=6.02*p.enob+1.76,backoff=p.backoff,snrQsignal=snrQ-backoff;
 const vAlias=((p.v+vmax)%(2*vmax)+2*vmax)%(2*vmax)-vmax,apparentR=Math.abs(beat)*C/(2*slope),migration=Math.abs(p.v)*p.n*Tr;
 const bandStart=p.fc-p.bw/2,bandEnd=p.fc+p.bw/2,inBand=bandStart>0;
 function snrAt(r){const delay=2*r/C;if(delay>=Tc)return -300;const power=p.eirp+p.rcs+20*Math.log10(lambda)-30*Math.log10(4*Math.PI)-40*Math.log10(r)-p.loss-2*p.alpha*r/1000;return power-(db(K*T0)+30+p.einf)+db(p.n*(Tc-delay))-p.impl;}
 let lo=.0001,hi=C*Tc/2*.999;for(let i=0;i<70;i++){const mid=(lo+hi)/2;if(snrAt(mid)>p.threshold)lo=mid;else hi=mid;}const thermalRange=(lo+hi)/2;
 const checks=[{name:'教学检测门限',ok:margin>=0,detail:`热噪声裕量 ${margin.toFixed(1)} dB`},{name:'IF / 采样通带',ok:Math.abs(beat)<iflimit,detail:`|fb| ${(Math.abs(beat)/1e6).toFixed(2)} / 上限 ${(iflimit/1e6).toFixed(2)} MHz`},{name:'慢时间速度边界',ok:Math.abs(p.v)<vmax,detail:`理想模型 |v| < ${vmax.toFixed(2)} m/s`},{name:'有效观测',ok:tau<Tc&&ns>=16,detail:`τ ${(tau*1e9).toFixed(1)} ns · ${ns} 样点`},{name:'抗混叠',ok:p.ifbw<=p.fs/2,detail:`LPF ${p.ifbw} MHz / fs/2 ${(p.fs/2).toFixed(1)} MHz`},{name:'相干距离迁移',ok:migration<effectiveRes/2,detail:`帧内 ${(migration*1000).toFixed(1)} mm / 半单元 ${(effectiveRes*500).toFixed(1)} mm`}];
 return {lambda,B,Tc,Tr,tau,Tobs,slope,fd,beat,atm,spread,pr,noiseBW,noise,snrIn,processing,snr,margin,rangeRes,effectiveRes,vmax,vres,iflimit,rangeIF,ns,snrJ,snrQ,snrQsignal,backoff,vAlias,apparentR,migration,thermalRange,checks,snrAt,bandStart,bandEnd,inBand};
}
function phaseNoise(p,m,f){const src=p.pn-20*Math.log10(f/1e5),rf=10*Math.log10(p.mult*p.mult*10**(src/10)+10**(-13)),factor=4*Math.sin(Math.PI*f*m.tau)**2,IF=10*Math.log10(Math.max(1e-30,factor)*p.mult*p.mult*10**(src/10)+10**(-13)+10**(-14.5));return {src,rf,IF,factor};}
root.RadarModel={C,K,T0,db,presets,calculate,phaseNoise};if(typeof module!=='undefined')module.exports=root.RadarModel;
})(typeof window!=='undefined'?window:globalThis);
