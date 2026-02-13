
export interface FmiDataPoint {
  time: string;
  temperature: number;
  isForecast: boolean;
}

/**
 * Formats a Date object into the specific string format required by FMI API (YYYY-MM-DDTHH:mm:ssZ).
 * FMI is sensitive to milliseconds and trailing zeros in ISO strings.
 */
const formatFmiDate = (date: Date): string => {
  return date.toISOString().split('.')[0] + 'Z';
};

/**
 * Fetches real weather data from FMI.
 * Combines past observations (t2m) and future forecasts (Temperature).
 */
export const fetchHelsinkiWeatherTimeline = async (): Promise<FmiDataPoint[]> => {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const tomorrow = new Date(now.getTime() + 12 * 60 * 60 * 1000); 

  const startStr = formatFmiDate(yesterday);
  const nowStr = formatFmiDate(now);
  const endStr = formatFmiDate(tomorrow);

  // Observations use 't2m' parameter
  const obsUrl = `https://opendata.fmi.fi/wfs?request=getFeature&storedquery_id=fmi::observations::weather::simple&place=helsinki&parameters=t2m&starttime=${startStr}&endtime=${nowStr}`;
  // Forecasts (Harmonie) use 'Temperature' parameter - 't2m' is not recognized there
  const forUrl = `https://opendata.fmi.fi/wfs?request=getFeature&storedquery_id=fmi::forecast::harmonie::surface::point::simple&place=helsinki&parameters=Temperature&starttime=${nowStr}&endtime=${endStr}`;

  try {
    const [obsRes, forRes] = await Promise.all([
      fetch(obsUrl),
      fetch(forUrl)
    ]);

    const [obsXml, forXml] = await Promise.all([obsRes.text(), forRes.text()]);
    
    const parser = new DOMParser();
    const parseResults = (xml: string, isForecast: boolean): FmiDataPoint[] => {
      const xmlDoc = parser.parseFromString(xml, "text/xml");
      
      // Check for ExceptionReport in XML
      const exceptions = xmlDoc.getElementsByTagName("ExceptionReport");
      if (exceptions.length > 0) {
        const text = xmlDoc.getElementsByTagName("ExceptionText")[0]?.textContent;
        console.error(`FMI API Exception (${isForecast ? 'Forecast' : 'Obs'}):`, text);
        return [];
      }

      const elements = xmlDoc.getElementsByTagName("BsWfs:BsWfsElement");
      const pts: FmiDataPoint[] = [];
      
      for (let i = 0; i < elements.length; i++) {
        const time = elements[i].getElementsByTagName("BsWfs:Time")[0]?.textContent;
        const val = elements[i].getElementsByTagName("BsWfs:ParameterValue")[0]?.textContent;
        if (time && val && !isNaN(parseFloat(val)) && val.trim() !== "NaN") {
          pts.push({ time, temperature: parseFloat(val), isForecast });
        }
      }
      return pts;
    };

    const observations = parseResults(obsXml, false);
    const forecasts = parseResults(forXml, true);

    if (observations.length === 0 && forecasts.length === 0) {
        console.warn("FMI API returned no data. Check internet connection or API status.");
        return [];
    }

    // Merge and return a continuous timeline
    return [...observations, ...forecasts];
  } catch (error) {
    console.error("Error fetching FMI timeline:", error);
    return [];
  }
};
