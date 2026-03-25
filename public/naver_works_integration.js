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
        var sections=[];

        // 1. 고객 기본 정보
        sections.push({
            title:'1. \uACE0\uAC1D \uAE30\uBCF8 \uC815\uBCF4',
            rows:[
                ['\uACE0\uAC1D\uBA85',name],
                ['\uC5F0\uB77D\uCC98',getVal('cPhone')],
                ['\uC0C1\uB2F4\uC77C\uC790',getVal('cDate')],
                ['\uC0C1\uB2F4\uBC29\uBC95',getChips('g-consultType')],
                ['\uAC70\uB798\uC720\uD615',deal],
                ['\uBB3C\uAC74\uC720\uD615',prop]
            ]
        });

        // 2. 지역 및 예산
        var budgetRows=[
            ['1\uC21C\uC704 \uC9C0\uC5ED',getVal('reg1')],
            ['2\uC21C\uC704 \uC9C0\uC5ED',getVal('reg2')],
            ['3\uC21C\uC704 \uC9C0\uC5ED',getVal('reg3')],
            ['\uAD8C\uC5ED',getChips('g-regPref')]
        ];
        if(deal==='\uB9E4\uB9E4'){
            var bMin=getVal('buyMin'),bMax=getVal('buyMax');
            if(bMin||bMax)budgetRows.push(['\uB9E4\uB9E4 \uD76C\uB9DD\uAC00',bMin+'~'+bMax+'\uB9CC\uC6D0']);
            budgetRows.push(['\uB300\uCD9C \uC774\uC6A9',getChips('g-loan')]);
        }
        if(deal==='\uC804\uC138'){
            var jMin=getVal('jMin'),jMax=getVal('jMax');
            if(jMin||jMax)budgetRows.push(['\uC804\uC138 \uBCF4\uC99D\uAE08',jMin+'~'+jMax+'\uB9CC\uC6D0']);
            budgetRows.push(['\uC804\uC138\uC790\uAE08\uB300\uCD9C',getChips('g-jloan')]);
        }
        if(deal==='\uC6D4\uC138'){
            budgetRows.push(['\uBCF4\uC99D\uAE08',getVal('mDep')+'\uB9CC\uC6D0']);
            budgetRows.push(['\uC6D4\uC138',getVal('mRent')+'\uB9CC\uC6D0']);
        }
        sections.push({title:'2. \uC9C0\uC5ED \uBC0F \uC608\uC0B0',rows:budgetRows});

        // 3. 매물 조건
        var detailRows=[
            ['\uBA74\uC801',(getVal('sMin')||'?')+'~'+(getVal('sMax')||'?')+'\uD3C9'],
            ['\uBC29 \uAC1C\uC218',getChips('g-room')],
            ['\uD654\uC7A5\uC2E4',getChips('g-bath')],
            ['\uD76C\uB9DD \uCE35\uC218',getChips('g-floor')],
            ['\uBC29\uD5A5',getChips('g-dir')],
            ['\uAC74\uCD95\uC5F0\uB3C4',getChips('g-age')],
            ['\uC8FC\uCC28',getChips('g-park')]
        ];
        var carType=getChips('g-carType');
        if(carType) detailRows.push(['\uCC28\uB7C9 \uC885\uB958',carType]);
        var evCharger=getChips('g-evCharger');
        if(evCharger) detailRows.push(['\uC804\uAE30\uCC28 \uCDA9\uC804',evCharger]);
        if(prop.indexOf('\uC0C1\uAC00')!==-1||prop.indexOf('\uC0AC\uBB34\uC2E4')!==-1){
            detailRows.push(['\uC5C5\uC885/\uC6A9\uB3C4',getVal('bizType')]);
            detailRows.push(['\uAD8C\uB9AC\uAE08',getChips('g-key')]);
            detailRows.push(['\uCE35\uC218',getChips('g-comFloor')]);
            detailRows.push(['\uAC04\uD310 \uC124\uCE58',getChips('g-sign')]);
        }
        sections.push({title:'3. \uB9E4\uBB3C \uC870\uAC74',rows:detailRows});

        // 4. 교통 및 편의시설
        var transRows=[
            ['\uC9C0\uD558\uCCA0 \uB3C4\uBCF4',getChips('g-subway')],
            ['\uC8FC\uC694 \uC774\uB3D9\uC218\uB2E8',getChips('g-trans')],
            ['\uC9C1\uC7A5/\uD559\uAD50',getVal('workplace')],
            ['\uD544\uC218 \uC8FC\uBCC0\uC2DC\uC124',getChips('g-fac')],
            ['\uD76C\uB9DD \uC635\uC158',getChips('g-opt')]
        ];
        var petType=getChips('g-pet');
        if(petType) transRows.push(['\uBC18\uB824\uB3D9\uBB3C \uC885\uB958',petType]);
        sections.push({title:'4. \uAD50\uD1B5 \uBC0F \uD3B8\uC758\uC2DC\uC124',rows:transRows});

        // 5. 입주 및 특이사항
        sections.push({
            title:'5. \uC785\uC8FC \uBC0F \uD2B9\uC774\uC0AC\uD56D',
            rows:[
                ['\uD76C\uB9DD \uC785\uC8FC\uC77C',getVal('moveDate')],
                ['\uC785\uC8FC \uC720\uC5F0\uC131',getChips('g-flex')],
                ['\uACC4\uC57D \uAE30\uAC04',getChips('g-period')],
                ['\uAC70\uC8FC \uC720\uD615',getChips('g-house')],
                ['\uD2B9\uBCC4 \uC870\uAC74',getChips('g-spec')],
                ['\uACE0\uAC1D \uC694\uCCAD\uC0AC\uD56D',getVal('addReq')],
                ['\uC911\uAC1C\uC0AC \uBA54\uBAA8',getVal('memo')]
            ]
        });

        // 6. 매물 선택 우선순위 (별점)
        sections.push({
            title:'6. \uB9E4\uBB3C \uC120\uD0DD \uC6B0\uC120\uC21C\uC704',
            rows:[
                ['\uD83D\uDCB0 \uAC00\uACA9/\uC608\uC0B0', getStars('price')],
                ['\uD83D\uDCCD \uC704\uCE58/\uAD50\uD1B5', getStars('loc')],
                ['\uD83D\uDCD0 \uBA74\uC801/\uAD6C\uC870', getStars('size')],
                ['\uD83C\uDFD7\uFE0F \uAC74\uBB3C \uC0C1\uD0DC', getStars('bld')],
                ['\uD83C\uDFEB \uD559\uAD70/\uD658\uACBD', getStars('env')]
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
})();
