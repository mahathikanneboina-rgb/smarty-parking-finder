import parkingApi from "../server/parkingApi";

export default function handler(req: any, res: any) {
  return parkingApi(req, res);
}
