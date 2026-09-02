package main
import (
 "context";"encoding/json";"fmt";"io";"net/http";"net/url";"os";"time"
 "github.com/bitencourtVitor/bor2-api/internal/repository"
 "github.com/bitencourtVitor/bor2-api/internal/service"
 "github.com/jackc/pgx/v5/pgxpool";"github.com/joho/godotenv"
)
func qbIDs(at,realm,entity string)map[string]bool{
 ids:=map[string]bool{}; start:=1
 for{
  q:=url.QueryEscape(fmt.Sprintf("SELECT Id FROM %s STARTPOSITION %d MAXRESULTS 1000",entity,start))
  u:=fmt.Sprintf("https://quickbooks.api.intuit.com/v3/company/%s/query?query=%s&minorversion=65",realm,q)
  req,_:=http.NewRequest("GET",u,nil);req.Header.Set("Authorization","Bearer "+at);req.Header.Set("Accept","application/json")
  resp,e:=http.DefaultClient.Do(req);if e!=nil{fmt.Println(e);break};b,_:=io.ReadAll(resp.Body);resp.Body.Close()
  var r struct{QueryResponse map[string]json.RawMessage}; json.Unmarshal(b,&r)
  raw,ok:=r.QueryResponse[entity]; if !ok{break}
  var arr []map[string]any; json.Unmarshal(raw,&arr); if len(arr)==0{break}
  for _,o:=range arr{ if id,ok:=o["Id"].(string);ok{ids[id]=true} }
  if len(arr)<1000{break}; start+=1000; time.Sleep(200*time.Millisecond)
 }
 return ids
}
func main(){
 _=godotenv.Load(".env",".env.qbsync")
 db,_:=pgxpool.New(context.Background(),os.Getenv("DATABASE_URL"));defer db.Close()
 oauth:=service.NewQBOAuthService(repository.NewPostgresQBCredentialsRepository(db))
 ctx:=context.Background()
 for _,co:=range []string{"framing","hvac","pcg"}{
  at,realm,err:=oauth.GetAccessToken(ctx,co);if err!=nil{fmt.Printf("[%s] token err %v\n",co,err);continue}
  for _,ent:=range []string{"Bill","Purchase","VendorCredit","Invoice","Estimate","Deposit","PurchaseOrder"}{
   tbl:=map[string]string{"Bill":"qb_bills","Purchase":"qb_purchases","VendorCredit":"qb_vendor_credits","Invoice":"qb_invoices","Estimate":"qb_estimates","Deposit":"qb_deposits","PurchaseOrder":"qb_purchase_orders"}[ent]
   qb:=qbIDs(at,realm,ent)
   rows,_:=db.Query(ctx,fmt.Sprintf("SELECT external_id FROM %s WHERE company=$1",tbl),co)
   var local,deleted int
   for rows.Next(){var id string;rows.Scan(&id);local++;if !qb[id]{deleted++}}
   rows.Close()
   fmt.Printf("[%s] %-14s local=%-6d QB=%-6d deleted(local-not-in-QB)=%d\n",co,ent,local,len(qb),deleted)
  }
 }
}
