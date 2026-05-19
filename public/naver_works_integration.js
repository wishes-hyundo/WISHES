/**
 * WISHES Naver Works Integration
 * Collects checklist data and posts to Naver Works board
 */
(function(){
    var API='/api/naver-works-post';

    function getVal(id){var el=document.getElementById(id);return el?el.value.trim():'';}

    function getChips(group){
        var sel=[];
        document.querySelectorAll('.chip.on').forEach(function(c){
            var m=c.getAttribute('onclick')||'';
            if(m.indexOf("'"+group+"'")!==-1) sel.push(c.textContent.trim().replace(/[\n\r]+/g,'').replace(/\s+/g,' '));
        });
        return sel.join(', ');
    }

    function getDeal(){
        var sel=document.querySelector('[onclick*="pickDeal"].on');
        if(!sel)return'-';
        var m=sel.getAttribute('onclick').match(/pickDeal\(this,'([^']+)'/);
        return m?m[1]:'-';
    }

    function getProp(){return getChips('g-propType');}

    /* ── 별점 읽기 (S.stars 글로벌 접근) ── */
    function getStars(key){
        try{
            var v=window.S&&window.S.stars&&window.S.stars[key];
            return v>0?'\u2605'.repeat(v)+'\u2606'.repeat(5-v):'\uBBF8\uD3C9\uAC00';
        } catch(e){return '\uBBF8\uD3C9\uAC00';}
    }

    function collectData(){
        var deal=getDeal();
        var prop=getProp();
        var name=getVal('cName')||'N/A';
        var visitDate=getVal('cDate');
        var visitTime=getVal('cTime');
        var visitSchedule=visitDate;
        if(visitTime)visitSchedule+=' '+visitTime;
        var sections=[];

        // 1. 고객 기본 정보
        sections.push({
            title:'1. 고객 기본 정보',
            rows:[
                ['고객명',name],
                ['연락처',getVal('cPhone')],
                ['방문일정',visitSchedule],
                ['거래유형',deal],
                ['매물유형',prop],
                ['금일계약진행',getChips('g-contractToday')]
            ]
        });

        // 2. 예산 및 지역
        var budgetRows=[
            ['1순위 지역',getVal('reg1')],
            ['2순위 지역',getVal('reg2')],
            ['3순위 지역',getVal('reg3')]
        ];
        if(deal==='매매'){
            var bMax=getVal('buyMax');
            if(bMax)budgetRows.push(['매매금액',bMax+'만원']);
            budgetRows.push(['대출이용',getChips('g-loan')]);
        }
        if(deal==='전세'){
            var jMax=getVal('jMax');
            if(jMax)budgetRows.push(['전세금액',jMax+'만원']);
            budgetRows.push(['전세대출',getChips('g-jeonLoan')]);
        }
        if(deal==='월세'){
            budgetRows.push(['보증금',getVal('mDep')+'만원']);
            budgetRows.push(['월세',getVal('mRent')+'만원/월']);
        }
        sections.push({title:'2. 예산 및 지역',rows:budgetRows});

        // 3. 주차 / 반려동물
        var parkPetRows=[
            ['주차필요',getChips('g-parking')],
            ['차종/특이사항',getVal('parkingNote')],
            ['반려동물',getChips('g-petType')],
            ['반려동물 비고',getVal('petNote')]
        ];
        sections.push({title:'3. 주차 / 반려동물',rows:parkPetRows});

        // 4. 매물 조건
        var detailRows=[
            ['매물유형',getChips('g-propType')],
            ['입주가능일',getVal('f-moveDate')],
            ['입주유연성',getChips('g-moveFlex')]
        ];
        sections.push({title:'4. 매물 조건',rows:detailRows});

        // 5. 교통 및 편의시설
        var transRows=[
            ['지하철 도보거리',getChips('g-subway')],
            ['주요 이동수단',getChips('g-trans')],
            ['직장/학교 위치',getVal('workplace')]
        ];
        sections.push({title:'5. 교통 및 편의시설',rows:transRows});

        // 6. 입주 및 특이사항
        var livingRows=[
            ['편의시설',getChips('g-fac')],
            ['옵션',getChips('g-opt')],
            ['반려동물(상세)',getChips('g-pet')],
            ['거주유형',getChips('g-house')],
            ['고객 요청사항',getVal('addReq')]
        ];
        sections.push({title:'6. 입주 및 특이사항',rows:livingRows});

        // 7. 매물 선택 우선순위 (별점)
        sections.push({
            title:'7. 매물 선택 우선순위',
            rows:[
                ['가격/예산', getStars('price')],
                ['위치/교통', getStars('loc')],
                ['평수/규모', getStars('size')],
                ['건물 상태', getStars('bld')],
                ['환경/주변', getStars('env')]
            ]
        });

        return {cName:name,cPhone:getVal('cPhone'),deal:deal,prop:prop,sections:sections};
    }
    function sendToNW(){
        var btn=document.getElementById('nwSendBtn');
        if(btn){btn.disabled=true;btn.textContent='\uC804\uC1A1 \uC911...';}

        var data=collectData();
        fetch(API,{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify(data)
        })
        .then(function(r){return r.json();})
        .then(function(res){
            if(res.success){
                if(btn){btn.textContent='\u2705 \uC804\uC1A1 \uC644\uB8CC!';btn.style.background='#2e7d32';}
                alert('\uC911\uAC1C\uC0AC\uC5D0\uAC8C \uC804\uC1A1\uB418\uC5C8\uC2B5\uB2C8\uB2E4!');
            }else{
                if(btn){btn.textContent='\u274C \uC804\uC1A1 \uC2E4\uD328';btn.style.background='#c62828';}
                alert('\uC804\uC1A1 \uC2E4\uD328: '+(res.message||'Unknown'));
            }
        })
        .catch(function(e){
            if(btn){btn.textContent='\u274C \uC624\uB958';btn.style.background='#c62828';}
            alert('\uC624\uB958: '+e.message);
        })
        .finally(function(){
            setTimeout(function(){
                if(btn){btn.disabled=false;btn.textContent='\uD83D\uDCE4 \uC911\uAC1C\uC0AC\uC5D0\uAC8C \uC804\uC1A1';btn.style.background='#1a73e8';}
            },3000);
        });
    }

    function injectButton(){
        var resultPage=document.querySelectorAll('.page')[5];
        if(!resultPage)return;
        if(document.getElementById('nwSendBtn'))return;

        var container=document.createElement('div');
        container.style.cssText='text-align:center;margin:16px 0;';

        var btn=document.createElement('button');
        btn.id='nwSendBtn';
        btn.textContent='\uD83D\uDCE4 \uC911\uAC1C\uC0AC\uC5D0\uAC8C \uC804\uC1A1';
        btn.style.cssText="background:#1a73e8;color:#fff;border:none;padding:14px 28px;border-radius:8px;font-size:16px;font-weight:bold;cursor:pointer;box-shadow:0 2px 8px rgba(26,115,232,0.3);font-family:'GmarketSans',sans-serif;";
        btn.onclick=sendToNW;

        container.appendChild(btn);

        var linkBox=resultPage.querySelector('.link-box');
        if(linkBox){linkBox.parentNode.insertBefore(container,linkBox.nextSibling);}
        else{resultPage.appendChild(container);}
    }

    if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',injectButton);}
    else{injectButton();}

    new MutationObserver(function(){injectButton();}).observe(document.body,{childList:true,subtree:true});

  window.sendToNW = sendToNW;
  // 🚨 R58-hotfix — checklist HTML 의 startSend() 가 collectData 를 찾도록 노출.
  // 이전엔 IIFE 안에 갇혀 있어서 fallback {cName, cPhone} 만 전송됨 (사장님 발견 2026-05-19).
  window.collectData = collectData;
})();
