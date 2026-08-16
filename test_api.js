const API_URL = "http://104.214.170.158/api/v1";

async function runTests() {
  console.log("🚀 Starting Automated API Tests...\n");

  try {
    // 1. Create User A (Sender)
    console.log("1️⃣  Registering User A...");
    const userA_res = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `sender_${Date.now()}@test.com`,
        password: "password123",
        fullName: "Sender Tester",
        phone: "01700000001"
      })
    });
    console.log(`   Status: ${userA_res.status}`);
    if (userA_res.status === 500) {
      console.log(`   ❌ ERROR: ${await userA_res.clone().text()}`);
    }

    // 2. Login User A
    console.log("2️⃣  Logging in User A...");
    const loginA_res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: (await userA_res.clone().json()).data.user.email,
        password: "password123"
      })
    });
    const tokenA = (await loginA_res.json()).data.token;
    console.log(`   Token A received: ✅`);

    // 3. Get User A Wallet
    console.log("3️⃣  Fetching User A Wallet...");
    let walletA_res = await fetch(`${API_URL}/wallets`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${tokenA}` }
    });
    let walletA_data = (await walletA_res.json()).data;
    
    // If no wallet exists yet, create one
    if (!walletA_data || walletA_data.length === 0) {
      console.log("   (Creating wallet for User A...)");
      await fetch(`${API_URL}/wallets`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${tokenA}` },
        body: JSON.stringify({ currency: "USD" })
      });
      walletA_res = await fetch(`${API_URL}/wallets`, { method: "GET", headers: { "Authorization": `Bearer ${tokenA}` } });
      walletA_data = (await walletA_res.json()).data;
    }
    
    const walletA = walletA_data[0];
    console.log(`   Wallet A ID: ${walletA.id}`);

    console.log("\n-----------------------------------\n");

    // 4. Create User B (Receiver)
    console.log("4️⃣  Registering User B...");
    const userB_res = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `receiver_${Date.now()}@test.com`,
        password: "password123",
        fullName: "Receiver Tester",
        phone: `01700${Math.floor(Math.random() * 100000)}`
      })
    });
    console.log(`   Status: ${userB_res.status}`);

    // 5. Login User B
    console.log("5️⃣  Logging in User B...");
    const loginB_res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: (await userB_res.clone().json()).data.user.email,
        password: "password123"
      })
    });
    const tokenB = (await loginB_res.json()).data.token;
    console.log(`   Token B received: ✅`);

    // 6. Get User B Wallet
    console.log("6️⃣  Fetching User B Wallet...");
    let walletB_res = await fetch(`${API_URL}/wallets`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${tokenB}` }
    });
    let walletB_data = (await walletB_res.json()).data;
    
    // If no wallet exists yet, create one
    if (!walletB_data || walletB_data.length === 0) {
      console.log("   (Creating wallet for User B...)");
      await fetch(`${API_URL}/wallets`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${tokenB}` },
        body: JSON.stringify({ currency: "USD" })
      });
      walletB_res = await fetch(`${API_URL}/wallets`, { method: "GET", headers: { "Authorization": `Bearer ${tokenB}` } });
      walletB_data = (await walletB_res.json()).data;
    }
    
    const walletB = walletB_data[0];
    console.log(`   Wallet B Number: ${walletB.wallet_number}`);

    console.log("\n-----------------------------------\n");

    // 6.5 Top Up User A Wallet
    console.log("💰 Topping up User A with $100...");
    await fetch(`${API_URL}/wallets/${walletA.id}/top-up`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${tokenA}`
      },
      body: JSON.stringify({ amount: 100.00, provider: "mock" })
    });
    console.log(`   Top-up successful! ✅`);

    console.log("\n-----------------------------------\n");

    // 7. Send Money! (From A to B)
    console.log("💸 Sending $50 from User A to User B...");
    const transfer_res = await fetch(`${API_URL}/transfers`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        fromWalletId: walletA.id,
        toWalletNumber: walletB.wallet_number,
        amount: 50.00,
        note: "Automated test transfer!"
      })
    });
    
    const transferData = await transfer_res.json();
    console.log(`   Transfer Status: ${transfer_res.status}`);
    if(transfer_res.status === 201) {
      console.log(`   🎉 SUCCESS! User A Balance is now: $${transferData.data.fromBalance}`);
    } else {
      console.log("   ❌ FAILED:", transferData);
    }

  } catch (err) {
    console.error("Test script crashed:", err);
  }
}

runTests();
