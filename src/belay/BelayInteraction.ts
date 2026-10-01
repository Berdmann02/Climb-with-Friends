/** Rope ownership is separate from UI and actor control; a room authority can mirror it. */
export interface RopeReservation {routeId:string;climberId:string;belayerId:string;}
export class BelayInteraction {
  private reservation:RopeReservation|null=null;
  get state():'available'|'in-use' {return this.reservation?'in-use':'available';}
  get owner():Readonly<RopeReservation>|null {return this.reservation;}
  claim(routeId:string,climberId:string,belayerId:string):boolean {
    if(this.reservation)return false;
    this.reservation={routeId,climberId,belayerId};return true;
  }
  release(belayerId:string):void {if(this.reservation?.belayerId===belayerId)this.reservation=null;}
  /** Apply authoritative multiplayer state before evaluating local interaction availability. */
  synchronize(reservation:RopeReservation|null):void {this.reservation=reservation?{...reservation}:null;}
}
