import { Component, type ReactNode } from "react";
export class ErrorBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(){console.error("The interface could not render; reload to retry.");}
 render(){return this.state.failed?<main role="alert" aria-labelledby="error-boundary-title" style={{padding:32,maxWidth:500,margin:"auto",color:"#f4f7f2",fontFamily:"sans-serif"}}><h1 id="error-boundary-title">畫面暫時無法顯示</h1><p>請重新載入後再試。已儲存到帳號的資料不受影響；尚未儲存的搜尋條件可能需要重新填寫。</p><button type="button" onClick={()=>{location.hash="/home";location.reload();}}>重新載入首頁</button></main>:this.props.children;}
}
