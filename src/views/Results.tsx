React.useEffect(() => {
  const fetchTurnout = async () => {
    try {
      // Change from a relative path to your full absolute Render URL
      const res = await fetch('https://laa-voting-system.onrender.com/api/results/turnout');
      if (res.ok) {
        const data = await res.json();
        setTurnoutData({
          total_eligible: data.total_eligible,
          votes_cast: data.votes_cast,
          turnout_percentage: data.turnout_percentage
        });
      } else {
        console.error('Server returned an error status:', res.status);
      }
    } catch (err) {
      console.error('Failed to fetch turnout', err);
    }
  };

  fetchTurnout();

  // Refresh every 10 seconds to keep live metrics accurate
  const interval = setInterval(fetchTurnout, 10000);
  return () => clearInterval(interval);
}, []);