const bubble = document.getElementById('bubble');
let start, moved = false, dragging = false, hover;
bubble.addEventListener('pointerenter',()=>{hover=setTimeout(()=>{if(!start)window.widget.open(false);},160);});
bubble.addEventListener('pointerleave',()=>clearTimeout(hover));
bubble.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;
  clearTimeout(hover);start={x:event.screenX,y:event.screenY};moved=false;
  bubble.setPointerCapture(event.pointerId);
});
bubble.addEventListener('pointermove',event=>{
  if(!start)return;
  if(!dragging && Math.hypot(event.screenX-start.x,event.screenY-start.y)>4){dragging=true;moved=true;window.widget.drag('start');}
  if(dragging)window.widget.drag('move');
});
function endDrag(){if(dragging)window.widget.drag('end');dragging=false;start=null;}
bubble.addEventListener('pointerup',()=>{endDrag();if(!moved)window.widget.open(true);});
bubble.addEventListener('pointercancel',endDrag);
bubble.addEventListener('lostpointercapture',endDrag);
bubble.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')window.widget.open(true);});
bubble.addEventListener('contextmenu',event=>{event.preventDefault();window.widget.menu();});
