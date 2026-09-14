(() => {
  const E=window.SimEngine;if(!E)return;
  const previousIntentLabel=E.intentLabel;
  if(previousIntentLabel)E.intentLabel=(intentOrKind)=>previousIntentLabel(intentOrKind);
  E.socialBidSummary=(a)=>{
    if(!a)return {sourceBid:'無',observed:[]};
    const sourceBid=a.activeIntent?.source?.type==='socialBid'?a.activeIntent.source.bidId:null;
    return {sourceBid:sourceBid||'無',observed:(a.observedSocialBids||[]).map(x=>x.bidId)};
  };
})();
