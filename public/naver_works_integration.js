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

        // 1. \uACE0\uAC1D \uAE30\uBCF8 \uC815\uBCF4
        sections.push({
            title:'1. \uACE0\uAC1D \uAE30\uBCF8 \uC815\uBCF4',
            rows:[
                ['\uACE0\uAC1D\uBA85',name],
                ['\uC5F0\uB77D\uCC98',getVal('cPhone')],
                ['\uBC29\uBB38\uC77C\uC815',getVal('cDate')],
                ['\uAC70\uB798\uC720\uD615',deal],
                ['\uB9E4\uBB3C\uC720\uD615',prop],
                ['\uAE08\uC77C\uACC4\uC57D\uC9C4\uD589',getChips('g-contractToday')]
            ]
        });

        // 2. \uC608\uC0B0 \uBC0F \uC9C0\uC5ED
        var budgetRows=[
            ['1\uC21C\uC704 \uC9C0\uC5ED',getVal('reg1')],
            ['2\uC21C\uC704 \uC9C0\uC5ED',getVal('reg2')],
            ['3\uC21C\uC704 \uC9C0\uC5ED',getVal('reg3')]
        ];
        if(deal==='\uB9E4\uB9E4'){
            var bMin=getVal('buyMin'),bMax=getVal('buyMax');
            if(bMin||bMax)budgetRows.push(['\uB9E4\uB9E4\uC608\uC0B0',bMin+'~'+bMax+'\uB9CC\uC6D0']);
            budgetRows.push(['\uB300\uCD9C\uC774\uC6A9',getChips('g-loan')]);
        }
        if(deal==='\uC804\uC138'){
            var jMin=getVal('jMin'),jMax=getVal('jMax');
            if(jMin||jMax)budgetRows.push(['\uC804\uC138\uC608\uC0B0',jMin+'~'+jMax+'\uB9CC\uC6D0']);
            budgetRows.push(['\uC804\uC138\uB300\uCD9C',getChips('g-jeonLoan')]);
        }
        if(deal==='\uC6D4\uC138'){
            budgetRows.push(['\uBCF4\uC99D\uAE08',getVal('mDep')+'\uB9CC\uC6D0']);
            budgetRows.push(['\uC6D4\uC138',getVal('mRent')+'\uB9CC\uC6D0/\uC6D4']);
        }
        sections.push({title:'2. \uC608\uC0B0 \uBC0F \uC9C0\uC5ED',rows:budgetRows});

        // 3. \uB9E4\uBB3C \uC870\uAC74
        var detailRows=[
            ['\uB9E4\uBB3C\uC720\uD615',getChips('g-propType')],
            ['\uC785\uC8FC\uAC00\uB2A5\uC77C',getVal('f-moveDate')],
            ['\uC785\uC8FC\uC720\uC5F0\uC131',getChips('g-moveFlex')]
        ];
        sections.push({title:'3. \uB9E4\uBB3C \uC870\uAC74',rows:detailRows});

        // 4. \uAD50\uD1B5 \uBC0F \uD3B8\uC758\uC2DC\uC124
        var transRows=[
            ['\uC9C0\uD558\uCCA0 \uB3C4\uBCF4\uAC70\uB9AC',getChips('g-subway')],
            ['\uC8FC\uC694 \uC774\uB3D9\uC218\uB2E8',getChips('g-trans')],
            ['\uC9C1\uC7A5/\uD559\uAD50 \uC704\uCE58',getVal('workplace')]
        ];
        sections.push({title:'4. \uAD50\uD1B5 \uBC0F \uD3B8\uC758\uC2DC\uC124',rows:transRows});

        // 5. \uC785\uC8FC \uBC0F \uD2B9\uC774\uC0AC\uD56D
        var livingRows=[
            ['\uD3B8\uC758\uC2DC\uC124',getChips('g-fac')],
            ['\uC635\uC158',getChips('g-opt')],
            ['\uBC18\uB824\uB3D9\uBB3C',getChips('g-pet')],
            ['\uAC70\uC8FC\uC720\uD615',getChips('g-house')],
            ['\uD2B9\uBCC4\uC870\uAC74',getChips('g-spec')],
            ['\uACE0\uAC1D \uC694\uCCAD\uC0AC\uD56D',getVal('addReq')]
        ];
        sections.push({title:'5. \uC785\uC8FC \uBC0F \uD2B9\uC774\uC0AC\uD56D',rows:livingRows});

        // 6. \uB9E4\uBB3C \uC120\uD0DD \uC6B0\uC120\uC21C\uC704 (\uBCC4\uC810)
        sections.push({
            title:'6. \uB9E4\uBB3C \uC120\uD0DD \uC6B0\uC120\uC21C\uC704',
            rows:[
                ['\uAC00\uACA9/\uC608\uC0B0', getStars('price')],
                ['\uC704\uCE58/\uAD50\uD1B5', getStars('loc')],
                ['\uD3C9\uC218/\uADDC\uBAA8', getStars('size')],
                ['\uAC74\uBB3C \uC0C1\uD0DC', getStars('bld')],
                ['\uD658\uACBD/\uC8FC\uBCC0', getStars('env')]
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
