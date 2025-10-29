Write-Host "🚀 Generating Herd Behavior Events..." -ForegroundColor Cyan

# Product catalog
$products = @(
    @{ product_id = "sneaker-limited-001"; product_name = "Limited Edition Sneakers"; category = "footwear"; price = 199.99; brand = "Nike" },
    @{ product_id = "wireless-headphones-2024"; product_name = "Wireless Headphones"; category = "electronics"; price = 299.99; brand = "Sony" },
    @{ product_id = "gaming-laptop-pro"; product_name = "Gaming Laptop"; category = "electronics"; price = 1599.99; brand = "Alienware" },
    @{ product_id = "smartwatch-premium"; product_name = "Premium Smartwatch"; category = "electronics"; price = 399.99; brand = "Apple" },
    @{ product_id = "yoga-mat-pro"; product_name = "Yoga Mat"; category = "fitness"; price = 89.99; brand = "Lululemon" }
)

# Event types
$eventTypes = @("view_product", "add_to_cart", "purchase")

Write-Host "`n📦 Sending normal traffic..." -ForegroundColor Yellow

# Send normal events
for ($i = 1; $i -le 20; $i++) {
    $product = $products | Get-Random
    $eventType = $eventTypes | Get-Random
    
    $body = @{
        event_type = $eventType
        product_id = $product.product_id
        product_name = $product.product_name
        category = $product.category
        price = $product.price
        brand = $product.brand
    } | ConvertTo-Json

    try {
        $response = Invoke-RestMethod -Uri "http://localhost:3000/track" -Method POST -Body $body -ContentType "application/json"
        Write-Host "✅ $eventType for $($product.product_name)" -ForegroundColor Green
    } catch {
        Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
    }

    Start-Sleep -Milliseconds (Get-Random -Minimum 500 -Maximum 2000)
}

Write-Host "`n🔥 Creating herd behavior spike..." -ForegroundColor Red

# Create spike for limited sneakers
$spikeProduct = $products[0]
for ($i = 1; $i -le 15; $i++) {
    $body = @{
        event_type = "view_product"
        product_id = $spikeProduct.product_id
        product_name = $spikeProduct.product_name
        category = $spikeProduct.category
        price = $spikeProduct.price
        brand = $spikeProduct.brand
    } | ConvertTo-Json

    try {
        $response = Invoke-RestMethod -Uri "http://localhost:3000/track" -Method POST -Body $body -ContentType "application/json"
        Write-Host "🔥 SPIKE: view_product for $($spikeProduct.product_name)" -ForegroundColor Red
    } catch {
        Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
    }

    Start-Sleep -Milliseconds 300  # Rapid events
}

Write-Host "`n🎉 Event generation completed!" -ForegroundColor Cyan
Write-Host "📊 Check Kafdrop: http://localhost:9000" -ForegroundColor Yellow
Write-Host "🔔 Check Alerts: http://localhost:8000/alerts" -ForegroundColor Yellow