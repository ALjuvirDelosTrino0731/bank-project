Compass Bank Admin Portal — Phase 4O
===================================

This employee interface is served by the Node.js backend at /employee/.
Do not open index.html directly as the authenticated API and database are required.

Setup:
1. Copy backend/.env.example to backend/.env locally, then fill in local credentials.
2. From backend/, run npm install and node server.js.
3. Browse http://localhost:3000/employee/ and authenticate using locally configured employee credentials.

Includes appointment management, dataset intelligence, a real-data evaluation UI,
and an experimental traffic scenario explorer. Research datasets and generated
research outputs are NOT distributed in the public source snapshot. The evaluation
and traffic explorer may display an unavailable-data state until locally restored.

Research integrity:
The Nigerian observation source (Bishop et al., 2018, DOI: 10.1016/j.dib.2018.05.101)
is not a validated predictor for a Philippine bank branch. Historical source dates
are unavailable. No generated research results should be described as verified
future calendar forecasts.
